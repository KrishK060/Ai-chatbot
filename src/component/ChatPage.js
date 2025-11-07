
'use client'; 
import { useState } from 'react';


import styles from '../styles/chatUI.module.css'
export default function ChatPage() {

  const [input, setInput] = useState('');

  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);


  const formatMessagesForAPI = (chatHistory) => {
    return chatHistory.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); 

    if (!input.trim() || isLoading) return;

    const userInput = input;
  const userMessage = { role: 'user', text: userInput };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput(''); 
    setIsLoading(true); 

    const apiMessages = formatMessagesForAPI(updatedMessages);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST', 
        headers: {
          'Content-Type': 'application/json', 
        },
        body: JSON.stringify({ messages: apiMessages }), 
      });

     
      const data = await response.json();
      if (response.ok) {
        const aiMessage = { role: 'model', text: data.text };
        setMessages(prevMessages => [...prevMessages, aiMessage]);
      } else {
        const errorMessage = { role: 'model', text: `Error: ${data.error}` };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
      }
    } catch (error) {
      // console.error('Fetch error:', error);
      const networkError = { role: 'model', text: 'Error: Could not connect to the server.' };
      setMessages(prevMessages => [...prevMessages, networkError]);
    } finally {
      setIsLoading(false); 
    }
  };
  return (
    <div className={styles['chat-container']}>
      
      <header className={styles['chat-header']}>
        <h1 className={styles['chat-title']}>Next.js AI Chatbot</h1>
        <p className={styles['chat-subtitle']}>Using the Gemini API</p>
      </header>

      <div className={styles['chat-messages']}>
        

        {messages.length === 0 && (
          <div className={styles['chat-empty']}>Ask me anything to get started!</div>
        )}
        
        {messages.map((msg, index) => (
         
          <div key={index} className={`${styles['chat-message']} ${styles[msg.role === 'user' ? 'user' : 'model']}`}>
            <div className={styles['message-bubble']}>
              <p>{msg.text}</p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className={`${styles['chat-message']} ${styles['model']}`}>
            <div className={styles['message-bubble']}>
              <div className={styles['loading-dots']}>
                <div></div><div></div><div></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className={styles['chat-footer']}>
        <form onSubmit={handleSubmit} className={styles['chat-form']}>
          
         
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className={styles['chat-input']}
            disabled={isLoading}
          />
          
          <button
            type="submit"
            className={styles['chat-send-button']}
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </form>
      </footer>
    </div>
  );
}
