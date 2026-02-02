import { createContext, useContext, useState, ReactNode } from 'react';

export type EditOperation = 'enhance' | 'cleanup' | 'background' | 'brand-style' | 'promo-overlay';
export type ExportFormat = 'ig-post' | 'ig-story' | 'reel-cover';

export interface EditorImage {
  id: string;
  originalUrl: string;
  editedUrl?: string;
  file?: File;
  operations: EditOperation[];
}

export interface EditorState {
  step: 'upload' | 'edit' | 'export';
  images: EditorImage[];
  selectedImageId: string | null;
  activeOperation: EditOperation | null;
  backgroundAssetId: string | null;
  presetId: string | null;
  isProcessing: boolean;
}

interface VisualEditorContextType {
  state: EditorState;
  setStep: (step: EditorState['step']) => void;
  addImages: (files: File[]) => void;
  removeImage: (id: string) => void;
  selectImage: (id: string) => void;
  setActiveOperation: (op: EditOperation | null) => void;
  updateImageUrl: (id: string, url: string) => void;
  setBackgroundAsset: (id: string | null) => void;
  setPreset: (id: string | null) => void;
  setProcessing: (processing: boolean) => void;
  reset: () => void;
}

const initialState: EditorState = {
  step: 'upload',
  images: [],
  selectedImageId: null,
  activeOperation: null,
  backgroundAssetId: null,
  presetId: null,
  isProcessing: false,
};

const VisualEditorContext = createContext<VisualEditorContextType | null>(null);

export function VisualEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(initialState);

  const setStep = (step: EditorState['step']) => {
    setState(prev => ({ ...prev, step }));
  };

  const addImages = (files: File[]) => {
    const newImages: EditorImage[] = files.map(file => ({
      id: crypto.randomUUID(),
      originalUrl: URL.createObjectURL(file),
      file,
      operations: [],
    }));
    
    setState(prev => ({
      ...prev,
      images: [...prev.images, ...newImages],
      selectedImageId: prev.selectedImageId || newImages[0]?.id || null,
    }));
  };

  const removeImage = (id: string) => {
    setState(prev => {
      const image = prev.images.find(img => img.id === id);
      if (image?.originalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(image.originalUrl);
      }
      const filtered = prev.images.filter(img => img.id !== id);
      return {
        ...prev,
        images: filtered,
        selectedImageId: prev.selectedImageId === id 
          ? (filtered[0]?.id || null)
          : prev.selectedImageId,
      };
    });
  };

  const selectImage = (id: string) => {
    setState(prev => ({ ...prev, selectedImageId: id }));
  };

  const setActiveOperation = (op: EditOperation | null) => {
    setState(prev => ({ ...prev, activeOperation: op }));
  };

  const updateImageUrl = (id: string, url: string) => {
    setState(prev => ({
      ...prev,
      images: prev.images.map(img =>
        img.id === id ? { ...img, editedUrl: url } : img
      ),
    }));
  };

  const setBackgroundAsset = (id: string | null) => {
    setState(prev => ({ ...prev, backgroundAssetId: id }));
  };

  const setPreset = (id: string | null) => {
    setState(prev => ({ ...prev, presetId: id }));
  };

  const setProcessing = (processing: boolean) => {
    setState(prev => ({ ...prev, isProcessing: processing }));
  };

  const reset = () => {
    state.images.forEach(img => {
      if (img.originalUrl.startsWith('blob:')) {
        URL.revokeObjectURL(img.originalUrl);
      }
    });
    setState(initialState);
  };

  return (
    <VisualEditorContext.Provider
      value={{
        state,
        setStep,
        addImages,
        removeImage,
        selectImage,
        setActiveOperation,
        updateImageUrl,
        setBackgroundAsset,
        setPreset,
        setProcessing,
        reset,
      }}
    >
      {children}
    </VisualEditorContext.Provider>
  );
}

export function useVisualEditor() {
  const context = useContext(VisualEditorContext);
  if (!context) {
    throw new Error('useVisualEditor must be used within VisualEditorProvider');
  }
  return context;
}
