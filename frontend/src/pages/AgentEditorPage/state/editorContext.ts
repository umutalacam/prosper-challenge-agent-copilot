import { createContext, useContext, type Dispatch } from "react";
import type { EditorAction, EditorState } from "./types";

export interface EditorContextValue {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

/** The agent editor's state and dispatch. Only valid inside <AgentEditor>. */
export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditor must be used inside <AgentEditor>.");
  return value;
}
