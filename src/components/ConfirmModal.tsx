"use client";

import { motion } from "framer-motion";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm rounded-3xl"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-80 bg-snow rounded-card px-7 py-6"
      >
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        <p className="text-body-sm text-graphite mt-2 leading-relaxed">{message}</p>
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 h-10 rounded-buttons bg-fog text-ink text-body-sm font-medium hover:bg-silver-mist transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 h-10 rounded-buttons bg-azure text-snow text-body-sm font-medium hover:bg-cobalt-link transition-colors cursor-pointer"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
