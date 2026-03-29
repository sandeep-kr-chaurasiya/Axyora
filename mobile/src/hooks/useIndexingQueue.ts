import { useEffect, useState } from "react";

import { indexingQueue, type QueueProgressEvent } from "../services/indexingQueue";
import type { ScannableFile } from "../services/scannerService";

export function useIndexingQueue() {
  const [queueSize, setQueueSize] = useState(0);
  const [events, setEvents] = useState<QueueProgressEvent[]>([]);
  const [isIdle, setIsIdle] = useState(true);

  useEffect(() => {
    const onProgress = (evt: QueueProgressEvent) => {
      setEvents((prev) => [evt, ...prev].slice(0, 200));
      setIsIdle(false);
    };

    const onQueueSize = (size: number) => {
      setQueueSize(size);
    };

    const onIdle = () => {
      setIsIdle(true);
    };

    indexingQueue.on("progress", onProgress);
    indexingQueue.on("queue-size", onQueueSize);
    indexingQueue.on("idle", onIdle);

    return () => {
      indexingQueue.off("progress", onProgress);
      indexingQueue.off("queue-size", onQueueSize);
      indexingQueue.off("idle", onIdle);
    };
  }, []);

  const enqueue = (files: ScannableFile[]) => {
    indexingQueue.enqueue(files);
  };

  return {
    queueSize,
    events,
    isIdle,
    enqueue,
  };
}
