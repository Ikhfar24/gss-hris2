'use client';

import { createContext, useContext } from 'react';

interface AttendancePresentation {
  captureOnly: boolean;
  onCompleted?: (action: 'check-in' | 'check-out') => void;
}

const AttendancePresentationContext = createContext<AttendancePresentation>({ captureOnly: false });

export function AttendancePresentationProvider({ children, onCompleted }: { children: React.ReactNode; onCompleted: (action: 'check-in' | 'check-out') => void }) {
  return <AttendancePresentationContext.Provider value={{ captureOnly: true, onCompleted }}>{children}</AttendancePresentationContext.Provider>;
}

export function useAttendancePresentation() {
  return useContext(AttendancePresentationContext);
}
