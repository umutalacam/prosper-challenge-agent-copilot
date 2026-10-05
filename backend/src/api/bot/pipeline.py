#
# Voice pipeline: WebRTC transport + ElevenLabs STT/TTS + OpenAI LLM, driven by a
# Pipecat Flows node graph. Generic: it runs whatever AgentBuilder it's given and
# holds no graph logic. Which agent a call gets is BotService's job (service.py).
#
#   agent JSON  ->  AgentBuilder  ->  Pipecat Flows graph  ->  FlowManager
#

import os

from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.elevenlabs.stt import ElevenLabsRealtimeSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.transports.base_transport import BaseTransport, TransportParams
from pipecat.workers.runner import WorkerRunner
from pipecat_flows import FlowManager

from agent_builder import AgentBuilder
from api.agents.repository import AgentVersion
from api.bot.call_log import CallLog
from api.calls.recorder import CallRecorder
from api.calls.service import CallRecordService

transport_params = {
    "webrtc": lambda: TransportParams(audio_in_enabled=True, audio_out_enabled=True),
}


async def run_bot(
    transport: BaseTransport,
    runner_args: RunnerArguments,
    builder: AgentBuilder,
    version: AgentVersion,
    call_records: CallRecordService,
) -> None:
    """Run one call: the voice pipeline driven by the agent's node graph, until the
    caller hangs up. The call is logged as it goes and stored when it ends.

    :param transport: The call's WebRTC transport.
    :param runner_args: The session (id, idle timeout, signal handling).
    :param builder: The compiled agent.
    :param version: The saved agent version it is.
    :param call_records: Where the finished call is stored.
    """
    config = builder.config
    logger.info(f"Starting '{config.name}' with {len(config.nodes)} nodes")

    stt = ElevenLabsRealtimeSTTService(api_key=os.environ["ELEVENLABS_API_KEY"])
    tts = ElevenLabsTTSService(
        api_key=os.environ["ELEVENLABS_API_KEY"],
        settings=ElevenLabsTTSService.Settings(voice=config.voice_id),
    )
    llm = OpenAILLMService(api_key=os.environ["OPENAI_API_KEY"], model=config.model)

    context = LLMContext()
    context_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(vad_analyzer=SileroVADAnalyzer()),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            context_aggregator.user(),
            llm,
            tts,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(enable_metrics=True, enable_usage_metrics=True),
        idle_timeout_secs=runner_args.pipeline_idle_timeout_secs,
    )

    flow_manager = FlowManager(
        llm=llm,
        context_aggregator=context_aggregator,
        worker=worker,
        transport=transport,
    )

    # The call's walk through the graph: CallLog logs every step and feeds the
    # CallRecorder it owns, whose timeline is stored when the call ends.
    call_log = CallLog(
        CallRecorder(runner_args.session_id, config, version)
    )
    builder.on_transition = call_log.transition

    # What was said, turn by turn, so the log shows the model improvising in a node.
    @context_aggregator.user().event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(aggregator, strategy, message):
        """A caller turn ended: log and record what they said.

        :param aggregator: The user context aggregator.
        :param strategy: What ended the turn.
        :param message: The turn, with its transcribed text.
        """
        if message.content:
            call_log.caller_said(message.content)

    @context_aggregator.assistant().event_handler("on_assistant_turn_stopped")
    async def on_assistant_turn_stopped(aggregator, message):
        """A bot turn ended: log and record what it said.

        :param aggregator: The assistant context aggregator.
        :param message: The turn, with its text and whether it was interrupted.
        """
        if message.content:
            call_log.bot_said(message.content, interrupted=message.interrupted)

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport, client):
        """The caller connected: start the flow at the agent's start node.

        :param transport: The call's transport.
        :param client: The connected client.
        """
        call_log.started()
        await flow_manager.initialize(builder.build_initial_node())

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        """The caller hung up: stop the pipeline (which ends and stores the call).

        :param transport: The call's transport.
        :param client: The client that left.
        """
        logger.debug("Client disconnected")
        await worker.cancel()

    runner = WorkerRunner(handle_sigint=runner_args.handle_sigint)
    await runner.add_workers(worker)
    try:
        await runner.run()
    except Exception as error:
        call_log.failed(error)
        raise
    finally:
        call_log.ended(flow_manager.state)
        await _save(call_records, call_log)


async def _save(call_records: CallRecordService, call_log: CallLog) -> None:
    """Store the finished call (CallRecordService also has its issues analyzed; the
    caller has hung up, so nobody waits). Never raises: a storage failure must not
    break hanging up.

    :param call_records: Where calls are stored.
    :param call_log: The finished call's log, holding its record.
    """
    try:
        await call_records.save(call_log.record())
    except Exception:
        logger.exception(f"Couldn't save call {call_log.id}")


async def run_call(
    runner_args: RunnerArguments,
    builder: AgentBuilder,
    version: AgentVersion,
    call_records: CallRecordService,
) -> None:
    """One call: build the transport for its WebRTC connection, then run the pipeline.

    :param runner_args: The session, with its WebRTC connection.
    :param builder: The compiled agent.
    :param version: The saved agent version it is.
    :param call_records: Where the finished call is stored.
    """
    transport = await create_transport(runner_args, transport_params)
    await run_bot(transport, runner_args, builder, version, call_records)
