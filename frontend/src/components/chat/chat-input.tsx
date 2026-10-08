"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button, Badge, Spinner } from "@/components/ui";
import { Send, Mic, MicOff, Paperclip, X, FileText, Upload } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { uploadFile, getFileUrl, type FileUploadResponse } from "@/lib/file-api";
import { getErrorMessage, MAX_UPLOAD_SIZE_MB } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string, fileIds?: string[], files?: FileUploadResponse[]) => void;
  disabled?: boolean;
  isProcessing?: boolean;
  /** When set, a stop control replaces the send button while processing. */
  onStop?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  isProcessing,
  onStop,
}: ChatInputProps) {
  const [message, setMessage] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<FileUploadResponse[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    if (!isProcessing && !isUploading && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isProcessing, isUploading]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    if (disabled || isUploading) return;

    const fileIds = attachedFiles.length > 0 ? attachedFiles.map((f) => f.id) : undefined;
    const files = attachedFiles.length > 0 ? attachedFiles : undefined;
    onSend(trimmed || "请分析附件内容", fileIds, files);
    setMessage("");
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleMic = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.info("语音输入仅支持 Chrome 浏览器");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result) continue;
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? "";
        } else {
          interim += result[0]?.transcript ?? "";
        }
      }
      setMessage(() => {
        return finalTranscript + (interim ? "\u200B" + interim : "");
      });
    };

    recognition.onend = () => {
      setIsListening(false);
      setMessage((prev) => prev.replace(/\u200B/g, ""));
    };

    recognition.onerror = () => {
      setIsListening(false);
      toast.error("语音识别出错");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    finalTranscript = message;
  }, [isListening, message]);

  // File upload to backend — shared by the file picker and drag-and-drop.
  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    for (const file of files) {
      if (file.size > MAX_UPLOAD_SIZE_MB * 1024 * 1024) {
        toast.error(`${file.name}: 文件过大，上限 ${MAX_UPLOAD_SIZE_MB}MB.`);
        continue;
      }

      setIsUploading(true);
      try {
        const result = await uploadFile(file);
        setAttachedFiles((prev) => [...prev, result]);
      } catch (err) {
        toast.error(`${file.name}: ${getErrorMessage(err, "上传失败")}`);
      } finally {
        setIsUploading(false);
      }
    }
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      // Copy before resetting: the FileList is live and is emptied by clearing the input value.
      const files = Array.from(e.target.files);
      e.target.value = "";
      await uploadFiles(files);
    },
    [uploadFiles],
  );

  // Drag-and-drop files anywhere onto the composer. A counter handles nested
  // dragenter/dragleave so the overlay doesn't flicker over child elements.
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const handleDragEnter = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (isFileDrag(e)) e.preventDefault();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) void uploadFiles(files);
  };

  const removeFile = (fileId: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="border-foreground/40 bg-card/95 text-foreground absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed text-sm font-medium backdrop-blur-sm">
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4" /> 松开即可添加附件
          </span>
        </div>
      )}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pb-2">
          {attachedFiles.map((file) => (
            <div key={file.id} className="relative">
              {file.file_type === "image" ? (
                <div className="group relative h-16 w-16 overflow-hidden rounded-lg border">
                  <Image
                    src={getFileUrl(file.id)}
                    alt={file.filename}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="bg-destructive text-destructive-foreground absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <Badge variant="secondary" className="gap-1.5 pr-1">
                  <FileText className="h-3 w-3" />
                  <span className="max-w-[150px] truncate text-xs">{file.filename}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(file.id)}
                    className="hover:bg-muted ml-0.5 rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          ))}
          {isUploading && (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed">
              <Spinner className="text-muted-foreground h-5 w-5" />
            </div>
          )}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题..."
          disabled={disabled}
          rows={1}
          className="placeholder:text-muted-foreground min-h-[40px] flex-1 resize-none scrollbar-thin bg-transparent py-2.5 text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 sm:text-base"
        />

        <div className="flex shrink-0 items-center gap-0.5 pb-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleMic}
            disabled={disabled}
            className="h-9 w-9"
            title={isListening ? "停止录音" : "语音输入"}
            aria-label={isListening ? "停止录音" : "语音输入"}
          >
            {isListening ? (
              <MicOff className="h-4 w-4 animate-pulse text-red-500" />
            ) : (
              <Mic className="text-muted-foreground h-4 w-4" />
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            className="h-9 w-9"
            title="添加附件"
            aria-label="添加附件"
          >
            {isUploading ? (
              <Spinner className="text-muted-foreground h-4 w-4" />
            ) : (
              <Paperclip className="text-muted-foreground h-4 w-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            accept="image/jpeg,image/png,image/gif,image/webp,.txt,.md,.csv,.json,.py,.js,.ts,.tsx,.html,.css,.yaml,.yml,.toml,.xml,.sql,.sh,.pdf,.docx"
            multiple
            className="hidden"
          />

          {isProcessing && onStop ? (
            <Button
              type="button"
              size="icon"
              onClick={onStop}
              className="h-9 w-9 rounded-lg"
              title="停止生成"
            >
              <span className="h-3 w-3 rounded-[3px] bg-current" aria-hidden="true" />
              <span className="sr-only">停止生成</span>
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={disabled || isUploading || (!message.trim() && attachedFiles.length === 0)}
              className="h-9 w-9 rounded-lg"
            >
              {isProcessing ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              <span className="sr-only">发送</span>
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
