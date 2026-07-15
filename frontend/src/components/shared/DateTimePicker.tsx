import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar, ChevronUp, ChevronDown, Clock } from 'lucide-react';

interface DateTimePickerProps {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
    value,
    onChange,
    placeholder = "Select date and time"
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'date' | 'time'>('date');
    const containerRef = useRef<HTMLDivElement>(null);

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

    // Handle document clicks to close popup on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
        if (increment) {
            h = (h + 1) % 24;
        } else {
            h = (h - 1 + 24) % 24;
        }
        newDate.setHours(h);
        onChange(toISOStringLocal(newDate));
    };

    // Adjust Minutes
    const adjustMinute = (increment: boolean) => {
        const newDate = new Date(parsedDate.getTime());
        let m = newDate.getMinutes();
        if (increment) {
            m = (m + 1) % 60;
        } else {
            m = (m - 1 + 60) % 60;
        }
        newDate.setMinutes(m);
        onChange(toISOStringLocal(newDate));
    };

    // Toggle Period (AM/PM)
    const setPeriod = (period: 'AM' | 'PM') => {
        if (currentPeriod === period) return;
        const newDate = new Date(parsedDate.getTime());
        let h = newDate.getHours();
        if (period === 'PM') {
            h = (h + 12) % 24;
        } else {
            h = (h - 12 + 24) % 24;
        }
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

    const days = [];
    // Prev month padding days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        days.push({ day: totalDaysPrev - i, current: false });
    }
    // Current month days
    for (let i = 1; i <= totalDays; i++) {
        days.push({ day: i, current: true });
    }
    // Next month padding days
    const totalSlots = 42; // 6 rows of 7 days
    const nextPadding = totalSlots - days.length;
    for (let i = 1; i <= nextPadding; i++) {
        days.push({ day: i, current: false });
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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
                <span>{value ? formatDisplay(value) : placeholder}</span>
                <Calendar size={15} style={{ opacity: 0.6 }} />
            </div>

            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    zIndex: 9999,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '12px 14px',
                    width: '276px',
                    boxSizing: 'border-box'
                }}>
                    {/* Tab Navigation */}
                    <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 12, paddingBottom: 2 }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('date')}
                            style={{
                                flex: 1, padding: '6px 12.5px', border: 'none', background: 'transparent',
                                borderBottom: activeTab === 'date' ? '2.3px solid var(--accent)' : '2.3px solid transparent',
                                fontWeight: activeTab === 'date' ? 700 : 500,
                                color: activeTab === 'date' ? 'var(--accent)' : 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'all 0.15s'
                            }}
                        >
                            <Calendar size={13} /> Date
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('time')}
                            style={{
                                flex: 1, padding: '6px 12.5px', border: 'none', background: 'transparent',
                                borderBottom: activeTab === 'time' ? '2.3px solid var(--accent)' : '2.3px solid transparent',
                                fontWeight: activeTab === 'time' ? 700 : 500,
                                color: activeTab === 'time' ? 'var(--accent)' : 'var(--text-secondary)',
                                cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'all 0.15s'
                            }}
                        >
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
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
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
                                                height: 26,
                                                width: 26,
                                                background: isSelected ? 'var(--accent)' : 'transparent',
                                                color: isSelected ? '#ffffff' : d.current ? 'var(--text-primary)' : 'var(--text-muted)',
                                                border: 'none',
                                                borderRadius: '50%',
                                                cursor: d.current ? 'pointer' : 'default',
                                                fontSize: '0.72rem',
                                                fontWeight: isSelected ? 700 : 500,
                                                opacity: d.current ? 1 : 0.3,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                marginLeft: 'auto',
                                                marginRight: 'auto',
                                                transition: 'all 0.15s'
                                            }}
                                            onMouseEnter={e => {
                                                if (d.current && !isSelected) {
                                                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                                                }
                                            }}
                                            onMouseLeave={e => {
                                                if (d.current && !isSelected) {
                                                    e.currentTarget.style.background = 'transparent';
                                                }
                                            }}
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
                                {/* Hours adjustment */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <button type="button" onClick={() => adjustHour(true)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}><ChevronUp size={13} /></button>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 700, margin: '8px 0', minWidth: 26, textAlign: 'center', color: 'var(--text-primary)' }}>
                                        {currentHour12.toString().padStart(2, '0')}
                                    </span>
                                    <button type="button" onClick={() => adjustHour(false)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}><ChevronDown size={13} /></button>
                                </div>

                                <span style={{ fontSize: '1.25rem', fontWeight: 700, alignSelf: 'center', color: 'var(--text-primary)' }}>:</span>

                                {/* Minutes adjustment */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <button type="button" onClick={() => adjustMinute(true)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}><ChevronUp size={13} /></button>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 700, margin: '8px 0', minWidth: 26, textAlign: 'center', color: 'var(--text-primary)' }}>
                                        {currentMinute.toString().padStart(2, '0')}
                                    </span>
                                    <button type="button" onClick={() => adjustMinute(false)} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', padding: '2px 8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}><ChevronDown size={13} /></button>
                                </div>

                                {/* AM/PM toggle */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 8 }}>
                                    <button
                                        type="button"
                                        onClick={() => setPeriod('AM')}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            borderRadius: 4,
                                            border: '1px solid',
                                            cursor: 'pointer',
                                            background: currentPeriod === 'AM' ? 'var(--accent)' : 'transparent',
                                            color: currentPeriod === 'AM' ? '#ffffff' : 'var(--text-secondary)',
                                            borderColor: currentPeriod === 'AM' ? 'var(--accent)' : 'var(--border)'
                                        }}
                                    >
                                        AM
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPeriod('PM')}
                                        style={{
                                            padding: '4px 8px',
                                            fontSize: '0.68rem',
                                            fontWeight: 700,
                                            borderRadius: 4,
                                            border: '1px solid',
                                            cursor: 'pointer',
                                            background: currentPeriod === 'PM' ? 'var(--accent)' : 'transparent',
                                            color: currentPeriod === 'PM' ? '#ffffff' : 'var(--text-secondary)',
                                            borderColor: currentPeriod === 'PM' ? 'var(--accent)' : 'var(--border)'
                                        }}
                                    >
                                        PM
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Footer Section */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            {activeTab === 'date' ? 'Date selected' : 'Time adjusted'}
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsOpen(false)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'var(--accent)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '6px',
                                padding: '5px 12px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
