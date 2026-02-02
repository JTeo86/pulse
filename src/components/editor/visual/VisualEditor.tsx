import { motion } from 'framer-motion';
import { VisualEditorProvider, useVisualEditor } from './VisualEditorContext';
import VisualEditorUpload from './VisualEditorUpload';
import VisualEditorCanvas from './VisualEditorCanvas';
import VisualEditorExport from './VisualEditorExport';

function VisualEditorContent() {
  const { state } = useVisualEditor();

  return (
    <motion.div
      key={state.step}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      {state.step === 'upload' && <VisualEditorUpload />}
      {state.step === 'edit' && <VisualEditorCanvas />}
      {state.step === 'export' && <VisualEditorExport />}
    </motion.div>
  );
}

export default function VisualEditor() {
  return (
    <VisualEditorProvider>
      <div className="h-[calc(100vh-200px)] min-h-[600px]">
        <VisualEditorContent />
      </div>
    </VisualEditorProvider>
  );
}
