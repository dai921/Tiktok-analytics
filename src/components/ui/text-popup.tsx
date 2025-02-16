'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface TextPopupProps {
  isOpen: boolean
  onClose: () => void
  title: string
  content: string
}

export function TextPopup({ isOpen, onClose, title, content }: TextPopupProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="mt-2 max-h-[60vh] overflow-y-auto">
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
        </div>
      </DialogContent>
    </Dialog>
  )
} 