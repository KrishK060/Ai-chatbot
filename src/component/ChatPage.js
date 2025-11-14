'use client';

import { useState, useEffect, useRef } from 'react';
import styles from '../styles/chatUI.module.css';

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const messagesEndRef = useRef(null);

  useEffect(() => {
    let currentSessionId = localStorage.getItem('chatSessionId');
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
      localStorage.setItem('chatSessionId', currentSessionId);
    }
    setSessionId(currentSessionId);
  }, []);

  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchChatHistory = async () => {
    if (!sessionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/chat?sessionId=${sessionId}`);
      if (!response.ok) throw new Error('Failed to fetch chat history');
      const history = await response.json();
      setMessages(history);
    } catch (fetchError) {
      console.error(fetchError);
      setError('Error: Could not load chat history.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sessionId) fetchChatHistory();
  }, [sessionId]);

  
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!input.trim() || isLoading || !sessionId || editingMessageId) return;

    const userInput = input.trim();
    const optimisticUserMessage = {
      id: 'optimistic-' + Date.now(),
      role: 'user',
      text: userInput,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticUserMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userInput, sessionId, isEdit: false }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send message.');
      }

      const { userMessage, aiMessage } = await response.json();

      setMessages((prev) => [
        ...prev.filter((msg) => msg.id !== optimisticUserMessage.id),
        userMessage,
        aiMessage,
      ]);
    } catch (submitError) {
      console.error('Error during chat submission:', submitError);
      setError(submitError.message);
      setMessages((prev) =>
        prev.filter((msg) => msg.id !== optimisticUserMessage.id)
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (message) => {
    setEditingMessageId(message.id);
    setEditingText(message.text);
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText('');
  };

  const handleSaveEdit = async () => {
    if (!editingText.trim() || !sessionId || isLoading || !editingMessageId) return;
  
    const originalMessageId = editingMessageId;
    const newText = editingText.trim();
  
    setIsLoading(true);
    setIsEditing(true);
    setError(null);
    setEditingMessageId(null);
    setEditingText('');
  
    let loadingId = 'loading-' + Date.now();
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === originalMessageId);
      if (idx === -1) {
        return [
          ...prev,
          {
            id: loadingId,
            role: 'model',
            text: '',
            loading: true,
            createdAt: new Date().toISOString(),
          },
        ];
      }
      const sliced = prev.slice(0, idx + 1); 
      sliced[idx] = { ...sliced[idx], text: newText }; 
      sliced.push({
        id: loadingId,
        role: 'model',
        text: '',
        loading: true,
        createdAt: new Date().toISOString(),
      });
      return sliced;
    });
  
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newText,
          sessionId,
          isEdit: true,
          messageId: originalMessageId,
        }),
      });
  
      const raw = await response.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch (e) {
        console.error('Failed parsing JSON from /api/chat response:', raw, e);
        data = null;
      }
      console.debug('handleSaveEdit - raw response:', raw);
      console.debug('handleSaveEdit - parsed data:', data);
  
      if (!response.ok) {
        const errMsg = (data && data.error) || `HTTP ${response.status}`;
        throw new Error(errMsg);
      }
  
      const aiMessageCandidate =
        (data && data.aiMessage) ||
        (data && data.message && data.message.ai) ||
        (data && data.ai) ||
        null;
  
      if (!aiMessageCandidate || !aiMessageCandidate.id) {
        console.warn('No aiMessage found in response. Falling back to fetchChatHistory().');
        await fetchChatHistory();
        return;
      }
  
      const aiMessage = {
        id: aiMessageCandidate.id,
        role: aiMessageCandidate.role || 'model',
        text: aiMessageCandidate.text ?? (aiMessageCandidate.content || ''),
        createdAt: aiMessageCandidate.createdAt || new Date().toISOString(),
        ...aiMessageCandidate,
      };
  
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === loadingId || m.loading);
        if (idx === -1) {
          return [...prev, aiMessage];
        }
        const copy = [...prev];
        copy.splice(idx, 1, aiMessage);
        return copy;
      });
  
    } catch (editError) {
      console.error('Save edit error:', editError);
      setError(editError.message || 'Failed to edit message.');
      await fetchChatHistory();
    } finally {
      setIsLoading(false);
      setIsEditing(false);
      setTimeout(scrollToBottom, 50);
    }
  };
  

  return (
    <div className={styles['chat-container']}>
      <header className={styles['chat-header']}>
        <h1 className={styles['chat-title']}>Next.js Chatbot</h1>
      </header>

      <div className={styles['chat-messages']}>
        {messages.length === 0 && !isLoading && (
          <div className={styles['chat-empty']}>Ask me anything to get started!</div>
        )}

        {messages
          .filter((msg) => msg && msg.role)
          .map((msg) => (
            <div
              key={msg.id}
              className={`${styles['chat-message']} ${styles[msg.role === 'user' ? 'user' : 'model']}`}
            >
              <div className={styles['message-bubble']}>
                {msg.loading ? (
                  <div className={styles['loading-dots']}>
                    <div></div><div></div><div></div>
                  </div>
                ) : editingMessageId === msg.id ? (
                  <div className={styles['message-edit-form']}>
                    <textarea
                      className={styles['message-edit-textarea']}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      autoFocus
                    />
                    <div className={styles['message-edit-buttons']}>
                      <button
                        className={`${styles['btn-small']} ${styles['secondary']}`}
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={isLoading}
                      >
                        Cancel
                      </button>
                      <button
                        className={styles['btn-small']}
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={isLoading}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <p>{msg.text}</p>
                )}
              </div>

              {msg.role === 'user' && !editingMessageId && !isLoading && (
                <div className={styles['message-actions']}>
                  <button
                    type="button"
                    className={styles['edit-button']}
                    onClick={() => handleEdit(msg)}
                    title="Edit message"
                  >
                    <svg
                      className={styles['edit-button-svg']}
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}

        {isLoading && !messages.some((m) => m.loading) && (
          <div className={`${styles['chat-message']} ${styles['model']}`}>
            <div className={styles['message-bubble']}>
              <div className={styles['loading-dots']}>
                <div></div><div></div><div></div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <footer className={styles['chat-footer']}>
        {error && <p className={styles['error-message']}>{error}</p>}
        <form onSubmit={handleSubmit} className={styles['chat-form']}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className={styles['chat-input']}
            disabled={isLoading || !!editingMessageId}
          />
          <button
            type="submit"
            className={styles['chat-send-button']}
            disabled={isLoading || !input.trim() || !!editingMessageId}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  );
}
