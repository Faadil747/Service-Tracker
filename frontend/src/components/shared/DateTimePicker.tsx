import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Calendar, ChevronUp, ChevronDown, Clock } from 'lucide-react';

interface DateTimePickerProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
}

const POPUP_WIDTH = 288;       // compact — fits inside narrow modals/side-panels
const POPUP_EST_HEIGHT = 360;  // used only to decide flip-above vs drop-below

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
    value,
    onChange,
    placeholder = "Select date and time"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
    const containerRef = useRef<HTMLDivElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    // Fixed-position coords for the portalled popup, so it never gets clipped by
    // a parent modal's overflow (the day-panel is width:320/overflow:hidden with an
    // inner overflowY:auto region) and never overflows a narrow container.
    const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

    // Parse current date-time from prop
    const getInitialDate = () => {
        if (!value) return new Date();
        const d = new Date(value);
        return isNaN(d.getTime()) ? new Date() : d;
    };

    const parsedDate = getInitialDate();
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));

    // Update currentMonth if value changes from outside
    useEffect(() => {
        if (value) {
            const d = new Date(value);
            if (!isNaN(d.getTime())) {
                setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
            }
        }
    }, [value]);

    // ── Popup positioning ───────────────────────────────────────────────────
    // Anchored to the trigger via getBoundingClientRect and rendered in a portal
    // with position:fixed. We clamp horizontally to the viewport and flip above
    // the trigger when there isn't room below, so the whole picker is always
    // fully visible and reachable regardless of the surrounding container.
    const computePosition = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = Math.min(POPUP_WIDTH, vw - 16);

        let left = r.left;
        if (left + width > vw - 8) left = vw - width - 8;
        if (left < 8) left = 8;

        let top = r.bottom + 6;
        if (top + POPUP_EST_HEIGHT > vh - 8 && r.top - POPUP_EST_HEIGHT - 6 > 8) {
            top = r.top - POPUP_EST_HEIGHT - 6; // flip above
        }
        if (top < 8) top = 8;

        setCoords({ top, left, width });
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) return;
        computePosition();
        // capture=true also catches scrolling inside a modal's overflow container.
        const handler = () => computePosition();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [isOpen, computePosition, activeTab]);

    // Close on outside click — ignore clicks inside the trigger OR the portalled
    // popup (which lives outside containerRef in the DOM tree).
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (containerRef.current?.contains(target)) return;
            if (popupRef.current?.contains(target)) return;
            setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Close on Escape for keyboard accessibility.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen]);

    // Format display string
    const formatDisplay = (val: string) => {
        if (!val) return '';
        const d = new Date(val);
        if (isNaN(d.getTime())) return '';

        const day = d.getDate().toString().padStart(2, '0');
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = monthNames[d.getMonth()];
        const year = d.getFullYear();

        let hours = d.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be 12
        const minutes = d.getMinutes().toString().padStart(2, '0');

        return `${day} ${month} ${year}, ${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    };

    // Helper to format ISO datetime (local time zone) for inputs
    const toISOStringLocal = (d: Date) => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    // Time calculations
    const hours24 = parsedDate.getHours();
    let currentHour12 = hours24 % 12;
    if (currentHour12 === 0) currentHour12 = 12;
    const currentPeriod = hours24 >= 12 ? 'PM' : 'AM';
    const currentMinute = parsedDate.getMinutes();

    // Adjust Date (day selection)
    const handleSelectDay = (day: number) => {
        const newDate = new Date(parsedDate.getTime());
        newDate.setFullYear(currentMonth.getFullYear());
        newDate.setMonth(currentMonth.getMonth());
        newDate.setDate(day);
        onChange(toISOStringLocal(newDate));
        setActiveTab('time'); // Auto transition to setting time!
    };

    // Adjust Hours
    const adjustHour = (increment: boolean) => {
        const newDate = new Date(parsedDate.getTime());
        let h = newDate.getHours();
        h = increment ? (h + 1) % 24 : (h - 1 + 24) % 24;
        newDate.setHours(h);
        onChange(toISOStringLocal(newDate));
    };

    // Adjust Minutes
    const adjustMinute = (increment: boolean) => {
        const newDate = new Date(parsedDate.getTime());
        let m = newDate.getMinutes();
        m = increment ? (m + 1) % 60 : (m - 1 + 60) % 60;
        newDate.setMinutes(m);
        onChange(toISOStringLocal(newDate));
    };

    // Toggle Period (AM/PM)
    const setPeriod = (period: 'AM' | 'PM') => {
        if (currentPeriod === period) return;
        const newDate = new Date(parsedDate.getTime());
        let h = newDate.getHours();
        h = period === 'PM' ? (h + 12) % 24 : (h - 12 + 24) % 24;
        newDate.setHours(h);
        onChange(toISOStringLocal(newDate));
    };

    // Month navigation
    const prevMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };
    const nextMonth = (e: React.MouseEvent) => {
        e.stopPropagation();
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    // Calendar Grid Calculation
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const totalDaysPrev = new Date(year, month, 0).getDate();

    const days: { day: number; current: boolean }[] = [];
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        days.push({ day: totalDaysPrev - i, current: false });
    }
    for (let i = 1; i <= totalDays; i++) {
        days.push({ day: i, current: true });
    }
    const totalSlots = 42; // 6 rows of 7 days
    const nextPadding = totalSlots - days.length;
    for (let i = 1; i <= nextPadding; i++) {
        days.push({ day: i, current: false });
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    const stepBtnStyle: React.CSSProperties = {
        background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4,
        cursor: 'pointer', padding: '2px 8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center',
    };
    const tabBtnStyle = (tab: 'date' | 'time'): React.CSSProperties => ({
        flex: 1, padding: '6px 12px', border: 'none', background: 'transparent',
        borderBottom: activeTab === tab ? '2.3px solid var(--accent)' : '2.3px solid transparent',
        fontWeight: activeTab === tab ? 700 : 500,
        color: activeTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
        cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        transition: 'all 0.15s',
    });

    const popup = coords && (
        <div
            ref={popupRef}
            style={{
                position: 'fixed',
                top: coords.top,
                left: coords.left,
                width: coords.width,
                zIndex: 10000,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                padding: '12px 14px',
                boxSizing: 'border-box',
                maxHeight: 'calc(100vh - 16px)',
                overflowY: 'auto',
            }}
        >
            {/* Tab Navigation */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12, paddingBottom: 2 }}>
                <button type="button" onClick={() => setActiveTab('date')} style={tabBtnStyle('date')}>
                    <Calendar size={13} /> Date
                </button>
                <button type="button" onClick={() => setActiveTab('time')} style={tabBtnStyle('time')}>
                    <Clock size={13} /> Time
                </button>
            </div>

            {/* Tab Content Panels */}
            {activeTab === 'date' ? (
                <div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                            {monthNames[month]} {year}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <button type="button" onClick={prevMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 4, display: 'flex', alignItems: 'center' }}><ChevronLeft size={15} /></button>
                            <button type="button" onClick={nextMonth} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: 4, display: 'flex', alignItems: 'center' }}><ChevronRight size={15} /></button>
                        </div>
                    </div>

                    {/* Weekday headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontWeight: 600, fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                        {weekDays.map(wd => <div key={wd}>{wd}</div>)}
                    </div>

                    {/* Calendar days grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, justifyItems: 'center' }}>
                        {days.map((d, index) => {
                            const isSelected = d.current &&
                                parsedDate.getDate() === d.day &&
                                parsedDate.getMonth() === month &&
                                parsedDate.getFullYear() === year;
                            return (
                                <button
                                    type="button"
                                    key={index}
                                    disabled={!d.current}
                                    onClick={() => handleSelectDay(d.day)}
                                    style={{
                                        height: 28,
                                        width: 28,
                                        background: isSelected ? 'var(--accent)' : 'transparent',
                                        color: isSelected ? '#ffffff' : d.current ? 'var(--text-primary)' : 'var(--text-muted)',
                                        border: 'none',
                                        borderRadius: '50%',
                                        cursor: d.current ? 'pointer' : 'default',
                                        fontSize: '0.74rem',
                                        fontWeight: isSelected ? 700 : 500,
                                        opacity: d.current ? 1 : 0.3,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { if (d.current && !isSelected) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                                    onMouseLeave={e => { if (d.current && !isSelected) e.currentTarget.style.background = 'transparent'; }}
                                >
                                    {d.day}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%', padding: '10px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Hours */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <button type="button" onClick={() => adjustHour(true)} style={stepBtnStyle}><ChevronUp size={13} /></button>
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, margin: '8px 0', minWidth: 26, textAlign: 'center', color: 'var(--text-primary)' }}>
                                {currentHour12.toString().padStart(2, '0')}
                            </span>
                            <button type="button" onClick={() => adjustHour(false)} style={stepBtnStyle}><ChevronDown size={13} /></button>
                        </div>

                        <span style={{ fontSize: '1.25rem', fontWeight: 700, alignSelf: 'center', color: 'var(--text-primary)' }}>:</span>

                        {/* Minutes */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <button type="button" onClick={() => adjustMinute(true)} style={stepBtnStyle}><ChevronUp size={13} /></button>
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, margin: '8px 0', minWidth: 26, textAlign: 'center', color: 'var(--text-primary)' }}>
                                {currentMinute.toString().padStart(2, '0')}
                            </span>
                            <button type="button" onClick={() => adjustMinute(false)} style={stepBtnStyle}><ChevronDown size={13} /></button>
                        </div>

                        {/* AM/PM toggle */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 8 }}>
                            {(['AM', 'PM'] as const).map(period => (
                                <button
                                    key={period}
                                    type="button"
                                    onClick={() => setPeriod(period)}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        borderRadius: 4,
                                        border: '1px solid',
                                        cursor: 'pointer',
                                        background: currentPeriod === period ? 'var(--accent)' : 'transparent',
                                        color: currentPeriod === period ? '#ffffff' : 'var(--text-secondary)',
                                        borderColor: currentPeriod === period ? 'var(--accent)' : 'var(--border)',
                                    }}
                                >
                                    {period}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Footer Section */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    {activeTab === 'date' ? 'Pick a date' : 'Set the time'}
                </span>
                <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    style={{
                        background: 'var(--accent)', color: '#ffffff', border: 'none', borderRadius: '6px',
                        padding: '5px 14px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
                    }}
                >
                    Done
                </button>
            </div>
        </div>
    );

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <div
                onClick={() => {
                    if (!isOpen) setActiveTab('date');
                    setIsOpen(!isOpen);
                }}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: value ? 'var(--text-primary)' : 'var(--text-muted)',
                    minHeight: '40px',
                    boxSizing: 'border-box'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value ? formatDisplay(value) : placeholder}</span>
                <Calendar size={15} style={{ opacity: 0.6, flexShrink: 0, marginLeft: 6 }} />
            </div>

            {isOpen && typeof document !== 'undefined' && createPortal(popup, document.body)}
        </div>
    );
};
