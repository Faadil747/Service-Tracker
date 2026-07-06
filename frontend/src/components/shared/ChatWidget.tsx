import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Send, MessageSquare, Search, ArrowLeft, Users, X } from 'lucide-react';
import { chatApi, ChatMessage, usersApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { User } from '../../types';
import { useSearchParams } from 'react-router-dom';

export const ChatWidget: React.FC = () => {
    const { user } = useAuthStore();
    const [searchParams, setSearchParams] = useSearchParams();
    const chatWithParam = searchParams.get('chatWith') || searchParams.get('userId');

    const [isOpen, setIsOpen] = useState(false);
    const [agents, setAgents] = useState<User[]>([]);
    const [conversations, setConversations] = useState<ReturnType<typeof chatApi.getConversations>>([]);
    const [selectedPeer, setSelectedPeer] = useState<{ id: string; name: string } | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [search, setSearch] = useState('');
    const [showPeerList, setShowPeerList] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

    const loadConversations = useCallback(() => {
        if (!user) return;
        const convs = chatApi.getConversations(user.id);
        setConversations(convs);
        setUnreadCount(convs.reduce((s, c) => s + c.unread, 0));
    }, [user]);

    // Load agents list on mount
    useEffect(() => {
        if (!user) return;
        usersApi.list({}).then(res => {
            setAgents((res.data as User[]).filter((u: User) => u.id !== user.id));
        }).catch(() => { });
        loadConversations();
        const unreadInterval = setInterval(loadConversations, 3000);
        return () => clearInterval(unreadInterval);
    }, [user, loadConversations]);

    const openChat = useCallback((peerId: string, peerName: string) => {
        if (!user) return;
        chatApi.markRead(user.id, peerId);
        setSelectedPeer({ id: peerId, name: peerName });
        setMessages(chatApi.getMessages(user.id, peerId));
        setShowPeerList(false);
        loadConversations();
        clearInterval(pollRef.current);
        pollRef.current = setInterval(() => {
            setMessages(chatApi.getMessages(user.id, peerId));
            loadConversations();
        }, 2000);
    }, [user, loadConversations]);

    // Watch for chatWith search query param changes to auto-open
    useEffect(() => {
        if (chatWithParam && agents.length > 0) {
            const peer = agents.find(a => a.id === chatWithParam);
            if (peer) {
                setIsOpen(true);
                openChat(peer.id, peer.full_name);
                // Clear the parameter to prevent loop
                const newParams = new URLSearchParams(searchParams);
                newParams.delete('chatWith');
                newParams.delete('userId');
                setSearchParams(newParams);
            }
        }
    }, [chatWithParam, agents, searchParams, setSearchParams, openChat]);

    useEffect(() => {
        return () => clearInterval(pollRef.current);
    }, []);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen]);

    const handleSend = () => {
        if (!inputText.trim() || !user || !selectedPeer) return;
        chatApi.sendMessage(user.id, user.full_name, selectedPeer.id, selectedPeer.name, inputText.trim());
        setInputText('');
        setMessages(chatApi.getMessages(user.id, selectedPeer.id));
        loadConversations();
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (!user) return null;

    const convPeerIds = new Set(conversations.map(c => c.peerId));
    const filteredAgents = agents.filter(a =>
        !search || a.full_name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, fontFamily: 'inherit' }}>
            {/* Toggled Chat Window */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    bottom: 72,
                    right: 0,
                    width: 380,
                    height: 520,
                    background: '#fff',
                    borderRadius: 16,
                    boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: '14px 16px',
                        background: 'var(--accent)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {!showPeerList && selectedPeer && (
                                <button
                                    className="btn btn-ghost btn-icon btn-sm"
                                    onClick={() => { setShowPeerList(true); setSelectedPeer(null); clearInterval(pollRef.current); }}
                                    style={{ color: '#fff', padding: 4, minWidth: 'auto', background: 'transparent' }}
                                >
                                    <ArrowLeft size={16} />
                                </button>
                            )}
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                                {!showPeerList && selectedPeer ? selectedPeer.name : 'Team Chat'}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => setIsOpen(false)}
                                style={{ color: '#fff', padding: 4, minWidth: 'auto', background: 'transparent' }}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Content area: Peer List or Active Conversation */}
                    {showPeerList ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff', minHeight: 0 }}>
                            {/* Search */}
                            <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
                                <div style={{ position: 'relative' }}>
                                    <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                    <input
                                        className="input"
                                        style={{ paddingLeft: 30, fontSize: '0.8rem', height: 32 }}
                                        placeholder="Search team..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Scrollable list */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                                {/* Recent Chats */}
                                {conversations.length > 0 && (
                                    <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 6 }}>
                                        <div style={{ padding: '6px 12px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent</div>
                                        {conversations.map(conv => (
                                            <div
                                                key={conv.peerId}
                                                onClick={() => openChat(conv.peerId, conv.peerName)}
                                                style={{
                                                    padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                                    transition: 'background 0.1s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: '0.8rem', flexShrink: 0 }}>
                                                    {conv.peerName.charAt(0).toUpperCase()}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: conv.unread > 0 ? 700 : 500, fontSize: '0.78rem' }}>{conv.peerName}</span>
                                                        {conv.unread > 0 && <span className="badge badge-accent" style={{ fontSize: '0.55rem', padding: '1px 5px' }}>{conv.unread}</span>}
                                                    </div>
                                                    <div className="truncate" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                                        {conv.lastMsg?.text}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Team Members list */}
                                <div>
                                    <div style={{ padding: '6px 12px', fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Users size={10} /> Team Members
                                    </div>
                                    {filteredAgents.map(a => (
                                        <div
                                            key={a.id}
                                            onClick={() => openChat(a.id, a.full_name)}
                                            style={{
                                                padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--purple-glow)', border: '1px solid var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--purple)', fontSize: '0.8rem', flexShrink: 0 }}>
                                                {a.full_name.charAt(0).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 500, fontSize: '0.78rem' }}>{a.full_name}</div>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{a.role} · {a.region}</div>
                                            </div>
                                            {convPeerIds.has(a.id) && (
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
                                            )}
                                        </div>
                                    ))}
                                    {filteredAgents.length === 0 && (
                                        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>No members found</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', minHeight: 0 }}>
                            {/* Messages List */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {messages.length === 0 ? (
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                        No messages yet. Say hello! 👋
                                    </div>
                                ) : (
                                    messages.map(msg => {
                                        const isMe = msg.senderId === user.id;
                                        return (
                                            <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 6, alignItems: 'flex-end' }}>
                                                {!isMe && (
                                                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--purple-glow)', border: '1px solid var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--purple)', fontSize: '0.65rem', flexShrink: 0 }}>
                                                        {msg.senderName.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div style={{ maxWidth: '75%' }}>
                                                    <div style={{
                                                        padding: '8px 10px',
                                                        borderRadius: isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                                                        background: isMe ? 'var(--accent)' : '#fff',
                                                        color: isMe ? '#fff' : 'var(--text-primary)',
                                                        fontSize: '0.78rem',
                                                        lineHeight: 1.4,
                                                        border: isMe ? 'none' : '1px solid var(--border)',
                                                        boxShadow: 'var(--shadow-xs)',
                                                        wordBreak: 'break-word',
                                                        whiteSpace: 'pre-wrap',
                                                    }}>
                                                        {msg.text}
                                                    </div>
                                                    <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 2, textAlign: isMe ? 'right' : 'left' }}>
                                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Input */}
                            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: '#fff' }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                                    <textarea
                                        ref={inputRef}
                                        className="textarea"
                                        style={{ flex: 1, minHeight: 36, maxHeight: 80, resize: 'none', borderRadius: 8, fontSize: '0.78rem', padding: '6px 10px', height: 36 }}
                                        placeholder="Type message..."
                                        value={inputText}
                                        onChange={e => setInputText(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        rows={1}
                                    />
                                    <button
                                        className="btn btn-primary btn-icon"
                                        style={{ borderRadius: 8, padding: 8, width: 36, height: 36, flexShrink: 0 }}
                                        onClick={handleSend}
                                        disabled={!inputText.trim()}
                                    >
                                        <Send size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Sticky Floating Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(37,99,235,0.4)',
                    transition: 'all 0.2s',
                    position: 'relative',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                <MessageSquare size={24} />
                {unreadCount > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: -2,
                        right: -2,
                        background: 'var(--danger)',
                        color: '#fff',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        height: 18,
                        minWidth: 18,
                        borderRadius: 9,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid #fff',
                        padding: '0 4px',
                    }}>
                        {unreadCount}
                    </div>
                )}
            </button>
        </div>
    );
};
