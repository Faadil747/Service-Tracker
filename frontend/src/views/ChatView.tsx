import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Send, MessageSquare, Search, ArrowLeft, Users } from 'lucide-react';
import { chatApi, ChatMessage, usersApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { User } from '../types';
import { useSearchParams } from 'react-router-dom';

export const ChatView: React.FC<{ region: string }> = () => {
    const { user } = useAuthStore();
    const [searchParams] = useSearchParams();
    const initialPeerId = searchParams.get('userId') || '';

    const [agents, setAgents] = useState<User[]>([]);
    const [conversations, setConversations] = useState<ReturnType<typeof chatApi.getConversations>>([]);
    const [selectedPeer, setSelectedPeer] = useState<{ id: string; name: string } | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputText, setInputText] = useState('');
    const [search, setSearch] = useState('');
    const [showPeerList, setShowPeerList] = useState(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

    const loadConversations = useCallback(() => {
        if (!user) return;
        setConversations(chatApi.getConversations(user.id));
    }, [user]);

    useEffect(() => {
        if (!user) return;
        // Load all agents/users to start new conversations
        usersApi.list({}).then(res => {
            setAgents((res.data as User[]).filter((u: User) => u.id !== user.id));
        }).catch(() => { });
        loadConversations();
    }, [user, loadConversations]);

    // Open conversation from URL param
    useEffect(() => {
        if (initialPeerId && agents.length > 0) {
            const peer = agents.find(a => a.id === initialPeerId);
            if (peer) openChat(peer.id, peer.full_name);
        }
    }, [initialPeerId, agents]);

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

    useEffect(() => {
        return () => clearInterval(pollRef.current);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!inputText.trim() || !user || !selectedPeer) return;
        chatApi.sendMessage(user.id, user.full_name, selectedPeer.id, selectedPeer.name, inputText.trim());
        setInputText('');
        setMessages(chatApi.getMessages(user.id, selectedPeer.id));
        loadConversations();
        setTimeout(() => inputRef.current?.focus(), 50);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    // All peers = agents + conversations with unknown peers
    const convPeerIds = new Set(conversations.map(c => c.peerId));
    const allAgents = [...agents];

    const filteredAgents = allAgents.filter(a =>
        !search || a.full_name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase())
    );

    const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);

    return (
        <div className="page-content animate-fade" style={{ padding: 0, height: 'calc(100vh - var(--header-height))', display: 'flex' }}>
            {/* Sidebar */}
            <div style={{
                width: showPeerList ? '100%' : 320,
                maxWidth: 320,
                borderRight: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                flexShrink: 0,
            }} className={showPeerList ? 'chat-sidebar-open' : 'chat-sidebar'}>
                {/* Sidebar header */}
                <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <MessageSquare size={18} color="var(--accent)" />
                            <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em' }}>Messages</span>
                            {totalUnread > 0 && (
                                <span className="badge badge-danger">{totalUnread}</span>
                            )}
                        </div>
                    </div>
                    <div style={{ position: 'relative' }}>
                        <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input
                            className="input"
                            style={{ paddingLeft: 30, fontSize: '0.8rem' }}
                            placeholder="Search team members..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* Conversation list (existing) */}
                {conversations.length > 0 && (
                    <div style={{ borderBottom: '1px solid var(--border)' }}>
                        <div style={{ padding: '8px 16px 4px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Recent</div>
                        {conversations.map(conv => (
                            <div
                                key={conv.peerId}
                                onClick={() => openChat(conv.peerId, conv.peerName)}
                                style={{
                                    padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                    background: selectedPeer?.id === conv.peerId ? 'var(--accent-glow)' : 'transparent',
                                    borderLeft: selectedPeer?.id === conv.peerId ? '3px solid var(--accent)' : '3px solid transparent',
                                    transition: 'all 0.12s',
                                }}
                                onMouseEnter={e => { if (selectedPeer?.id !== conv.peerId) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                                onMouseLeave={e => { if (selectedPeer?.id !== conv.peerId) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent-glow)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: '0.85rem', flexShrink: 0 }}>
                                    {conv.peerName.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: conv.unread > 0 ? 700 : 500, fontSize: '0.82rem' }}>{conv.peerName}</span>
                                        {conv.unread > 0 && <span className="badge badge-accent" style={{ fontSize: '0.6rem', padding: '2px 6px' }}>{conv.unread}</span>}
                                    </div>
                                    <div className="truncate" style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                        {conv.lastMsg?.text?.slice(0, 40)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* All team members */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    <div style={{ padding: '8px 16px 4px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Users size={12} /> Team Members
                    </div>
                    {filteredAgents.map(agent => (
                        <div
                            key={agent.id}
                            onClick={() => openChat(agent.id, agent.full_name)}
                            style={{
                                padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                                background: selectedPeer?.id === agent.id ? 'var(--accent-glow)' : 'transparent',
                                borderLeft: selectedPeer?.id === agent.id ? '3px solid var(--accent)' : '3px solid transparent',
                                transition: 'all 0.12s',
                            }}
                            onMouseEnter={e => { if (selectedPeer?.id !== agent.id) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                            onMouseLeave={e => { if (selectedPeer?.id !== agent.id) e.currentTarget.style.background = 'transparent'; }}
                        >
                            <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--purple-glow)', border: '1px solid var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--purple)', fontSize: '0.85rem', flexShrink: 0 }}>
                                {agent.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 500, fontSize: '0.82rem' }}>{agent.full_name}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{agent.role} · {agent.region}</div>
                            </div>
                            {convPeerIds.has(agent.id) && (
                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} title="Active conversation" />
                            )}
                        </div>
                    ))}
                    {filteredAgents.length === 0 && (
                        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>No members found</div>
                    )}
                </div>
            </div>

            {/* Chat Panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', minWidth: 0 }}>
                {!selectedPeer ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 16 }}>
                        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--accent-glow)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <MessageSquare size={32} color="var(--accent)" />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', marginBottom: 6 }}>Select a conversation</div>
                            <div style={{ fontSize: '0.85rem' }}>Choose a team member from the sidebar to start messaging</div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Chat header */}
                        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                onClick={() => { setShowPeerList(true); setSelectedPeer(null); clearInterval(pollRef.current); }}
                                style={{ display: 'none' }}
                                id="chat-back-btn"
                            >
                                <ArrowLeft size={16} />
                            </button>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--accent-glow)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--accent)', fontSize: '1rem' }}>
                                {selectedPeer.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{selectedPeer.name}</div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <div className="status-dot active" style={{ width: 5, height: 5 }} /> Active
                                </div>
                            </div>
                        </div>

                        {/* Messages */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {messages.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    No messages yet. Say hello! 👋
                                </div>
                            ) : (
                                messages.map(msg => {
                                    const isMe = msg.senderId === user?.id;
                                    return (
                                        <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', gap: 8, alignItems: 'flex-end' }}>
                                            {!isMe && (
                                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--purple-glow)', border: '1px solid var(--purple)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--purple)', fontSize: '0.7rem', flexShrink: 0 }}>
                                                    {msg.senderName.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            <div style={{ maxWidth: '65%' }}>
                                                <div style={{
                                                    padding: '10px 14px',
                                                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                                    background: isMe ? 'var(--accent)' : '#fff',
                                                    color: isMe ? '#fff' : 'var(--text-primary)',
                                                    fontSize: '0.85rem',
                                                    lineHeight: 1.5,
                                                    border: isMe ? 'none' : '1px solid var(--border)',
                                                    boxShadow: 'var(--shadow-xs)',
                                                    wordBreak: 'break-word',
                                                    whiteSpace: 'pre-wrap',
                                                }}>
                                                    {msg.text}
                                                </div>
                                                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 3, textAlign: isMe ? 'right' : 'left' }}>
                                                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    {isMe && <span> · {msg.read ? '✓✓' : '✓'}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', background: '#fff' }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                                <textarea
                                    ref={inputRef}
                                    className="textarea"
                                    style={{ flex: 1, minHeight: 44, maxHeight: 120, resize: 'none', borderRadius: 12, fontSize: '0.85rem', lineHeight: 1.5 }}
                                    placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                                    value={inputText}
                                    onChange={e => setInputText(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    rows={1}
                                />
                                <button
                                    className="btn btn-primary btn-icon"
                                    style={{ borderRadius: 10, padding: 11, flexShrink: 0, width: 44, height: 44 }}
                                    onClick={handleSend}
                                    disabled={!inputText.trim()}
                                >
                                    <Send size={16} />
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
