// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from 'react';

export function useNaturalSizeRecordTrust(subject: string | null): {
  distrusted: boolean;
  distrustRecord: () => void;
  trustAgain: () => void;
} {
  const [distrustedSubject, setDistrustedSubject] = useState<string | null>(null);
  const retriedSubject = useRef<string | null>(null);
  const knownSubject = useRef<string | null>(null);

  const distrustRecord = useCallback(() => {
    if (subject === null || retriedSubject.current === subject) return;
    retriedSubject.current = subject;
    setDistrustedSubject(subject);
  }, [subject]);

  const trustAgain = useCallback(() => {
    setDistrustedSubject((current) => (current === null ? current : null));
  }, []);

  useEffect(() => {
    if (subject === null) return;
    const previous = knownSubject.current;
    knownSubject.current = subject;
    if (previous === null || previous === subject) return;
    distrustRecord();
  }, [distrustRecord, subject]);

  return {
    distrusted: distrustedSubject !== null && distrustedSubject === subject,
    distrustRecord,
    trustAgain,
  };
}
