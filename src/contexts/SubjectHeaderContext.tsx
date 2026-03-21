"use client";

import React, { createContext, useContext, useState, useCallback } from 'react';

export interface SubjectHeaderInfo {
    name: string;
    topicIcon?: string;
    topicColor?: string;
    topicName?: string;
    agendaItemIndex?: number | null;
    nonAgendaReason?: string | null;
}

interface SubjectHeaderContextValue {
    subjectHeader: SubjectHeaderInfo | null;
    setSubjectHeader: (info: SubjectHeaderInfo | null) => void;
}

const SubjectHeaderContext = createContext<SubjectHeaderContextValue | undefined>(undefined);

export function SubjectHeaderProvider({ children }: { children: React.ReactNode }) {
    const [subjectHeader, setSubjectHeaderState] = useState<SubjectHeaderInfo | null>(null);

    const setSubjectHeader = useCallback((info: SubjectHeaderInfo | null) => {
        setSubjectHeaderState(info);
    }, []);

    return (
        <SubjectHeaderContext.Provider value={{ subjectHeader, setSubjectHeader }}>
            {children}
        </SubjectHeaderContext.Provider>
    );
}

export function useSubjectHeader() {
    const context = useContext(SubjectHeaderContext);
    if (context === undefined) {
        throw new Error('useSubjectHeader must be used within a SubjectHeaderProvider');
    }
    return context;
}

export function useSubjectHeaderOptional() {
    return useContext(SubjectHeaderContext);
}
