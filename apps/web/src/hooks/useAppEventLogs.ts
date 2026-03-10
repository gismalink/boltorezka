import { useCallback, useState } from "react";

export function useAppEventLogs(locale: string) {
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [callEventLog, setCallEventLog] = useState<string[]>([]);

  const pushLog = useCallback((text: string) => {
    setEventLog((prev) => [`${new Date().toLocaleTimeString(locale)} ${text}`, ...prev].slice(0, 30));
  }, [locale]);

  const pushCallLog = useCallback((text: string) => {
    setCallEventLog((prev) => [`${new Date().toLocaleTimeString(locale)} ${text}`, ...prev].slice(0, 30));
  }, [locale]);

  return {
    eventLog,
    callEventLog,
    pushLog,
    pushCallLog
  };
}
