import { Suspense, lazy, useState } from "react";

export type EditorLanguage = "json" | "html" | "xml" | "javascript" | "python" | "shell" | "java" | "text";

export type CodeEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  readOnly?: boolean;
  placeholder?: string;
  isVariableDefined?: (name: string) => boolean;
  wrap?: boolean;
};

// CodeMirror is most of the app's code and the first screen does not need it, so it lives in its own
// chunk. preloadEditor() warms it up while the app is idle so the first editor still opens instantly.
type EditorModule = typeof import("./CodeEditorImpl");
let loaded: EditorModule | null = null;
const loadEditor = () => import("./CodeEditorImpl").then((module) => (loaded = module));
const LazyEditor = lazy(loadEditor);

export function preloadEditor() {
  void loadEditor();
}

export function CodeEditor(props: CodeEditorProps) {
  // Once the chunk is in, render it directly: going through lazy() would still suspend for a frame.
  const [Ready] = useState(() => loaded?.default ?? null);
  if (Ready) return <Ready {...props} />;
  return (
    <Suspense fallback={<div className="h-full" />}>
      <LazyEditor {...props} />
    </Suspense>
  );
}
