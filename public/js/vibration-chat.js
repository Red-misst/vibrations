/**
 * Vibration Analysis Chat Interface
 * Provides AI-powered chat assistant for vibration data analysis
 */

document.addEventListener('DOMContentLoaded', () => {
    // Chat elements
    const chatInterface = document.getElementById('chatInterface');
    const chatHeader = document.getElementById('chatHeader');
    const toggleChat = document.getElementById('toggleChat');
    const chatMessages = document.getElementById('chatMessages');
    const userMessage = document.getElementById('userMessage');
    const sendMessage = document.getElementById('sendMessage');
    
    // State variables
    let sessionSelector;
    let isChatOpen = false;
    let isFullscreen = false;
    let currentSessionId = null;
    let isWaitingForResponse = false;
    let sessions = [];

    // Initialize the chat component
    function initChat() {
        // Create enhanced UI with fullscreen toggle and session selector
        createEnhancedUI();
        
        // Try to get current session from the main app
        const sessionIdSpan = document.getElementById('sessionId');
        if (sessionIdSpan && sessionIdSpan.textContent && sessionIdSpan.textContent !== 'None') {
            currentSessionId = sessionIdSpan.textContent;
            updateSessionSelector(currentSessionId);
            fetchChatHistory(currentSessionId);
        } else {
            // Load available sessions for the selector
            loadAvailableSessions();
        }
        
        // Listen for session changes from the main app
        document.addEventListener('sessionChanged', (event) => {
            currentSessionId = event.detail.sessionId;
            updateSessionSelector(currentSessionId);
            if (currentSessionId) {
                addSystemMessage(`Connected to session: ${event.detail.sessionName}`);
                fetchChatHistory(currentSessionId);
            }
        });
        
        // Listen for changes in the sessions list
        document.addEventListener('sessionsListUpdated', (event) => {
            if (event.detail && event.detail.sessions) {
                sessions = event.detail.sessions;
                updateSessionsDropdown(sessions);
            }
        });
        
        // Add global keyboard event listener for ESC key to exit fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isFullscreen) {
                exitFullscreen();
            }
        });
        
        // Check screen size to adjust initial UI
        adjustForScreenSize();
        
        // Listen for window resize events to adjust UI
        window.addEventListener('resize', adjustForScreenSize);
    }

    // Create enhanced UI elements
    function createEnhancedUI() {
        // Add fullscreen toggle button with better icon
        const fullscreenToggle = document.createElement('button');
        fullscreenToggle.id = 'fullscreenToggle';
        fullscreenToggle.className = 'text-gray-400 hover:text-gray-200 ml-2 p-1 rounded-full hover:bg-gray-600 transition-colors';
        fullscreenToggle.innerHTML = '<i class="fas fa-expand-alt"></i>';
        fullscreenToggle.title = 'Toggle fullscreen';
        fullscreenToggle.setAttribute('aria-label', 'Toggle fullscreen mode');
        
        // Add to header next to toggle chat button
        const chatHeaderControls = document.createElement('div');
        chatHeaderControls.className = 'chat-controls flex items-center';
        chatHeaderControls.appendChild(fullscreenToggle);
        
        const existingToggle = toggleChat.cloneNode(true);
        chatHeaderControls.appendChild(existingToggle);
        
        // Replace the old toggle button with our new container
        toggleChat.parentNode.replaceChild(chatHeaderControls, toggleChat);
        
        // Update the toggleChat reference to the new button
        toggleChat = existingToggle;
        
        // Add event listener for fullscreen toggle
        fullscreenToggle.addEventListener('click', toggleFullscreen);
        
        // Create session selector
        createSessionSelector();
        
        // Add a close button for fullscreen mode
        const closeFullscreenBtn = document.createElement('button');
        closeFullscreenBtn.id = 'closeFullscreenBtn';
        closeFullscreenBtn.className = 'hidden absolute top-4 right-4 text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 p-2 rounded-full transition-colors';
        closeFullscreenBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeFullscreenBtn.title = 'Exit fullscreen';
        chatInterface.appendChild(closeFullscreenBtn);
        
        closeFullscreenBtn.addEventListener('click', exitFullscreen);
    }

    // Toggle fullscreen mode - Improved implementation
    function toggleFullscreen() {
        isFullscreen = !isFullscreen;
        
        // Always make chat visible when toggling fullscreen
        if (!isChatOpen) {
            isChatOpen = true;
        }
        
        if (isFullscreen) {
            // Enter fullscreen mode
            chatInterface.classList.add('chat-fullscreen');
            document.body.classList.add('chat-active');
            document.getElementById('fullscreenToggle').innerHTML = '<i class="fas fa-compress-alt"></i>';
            document.getElementById('closeFullscreenBtn').classList.remove('hidden');
            
            // Focus on input field after transition
            setTimeout(() => {
                userMessage.focus();
            }, 300);
        } else {
            exitFullscreen();
        }
        
        // Update visibility after state change
        updateChatVisibility();
        
        // Scroll to bottom after transition
        setTimeout(scrollToBottom, 300);
    }
    
    // Exit fullscreen mode - Enhanced with smoother transitions
    function exitFullscreen() {
        isFullscreen = false;
        chatInterface.classList.remove('chat-fullscreen');
        document.body.classList.remove('chat-active');
        document.getElementById('fullscreenToggle').innerHTML = '<i class="fas fa-expand-alt"></i>';
        document.getElementById('closeFullscreenBtn').classList.add('hidden');
        
        // Update visibility after state change
        updateChatVisibility();
    }

    // Adjust UI based on screen size - Enhanced for better mobile support
    function adjustForScreenSize() {
        const isMobile = window.innerWidth < 768;
        
        if (isMobile) {
            chatInterface.classList.add('mobile-chat');
            
            // If we're on mobile, adjust chat sizing
            if (!chatInterface.style.width || chatInterface.style.width !== '100%') {
                chatInterface.style.width = '100%';
                chatInterface.style.right = '0';
                chatInterface.style.bottom = '0';
            }
            
            // If we're in fullscreen mode on mobile, make sure the chat is open
            if (isFullscreen && !isChatOpen) {
                isChatOpen = true;
                updateChatVisibility();
            }
        } else {
            chatInterface.classList.remove('mobile-chat');
            
            // Reset custom styles if switching back to desktop
            if (chatInterface.style.width === '100%') {
                chatInterface.style.width = '96px';
                chatInterface.style.right = '1rem';
            }
        }
        
        // Always scroll to bottom when adjusting size
        setTimeout(scrollToBottom, 100);
    }

    // Update chat visibility with improved transitions and positioning
    function updateChatVisibility() {
        const isMobile = window.innerWidth < 768;
        
        if (isFullscreen) {
            // In fullscreen mode, we don't use transform
            chatInterface.style.transform = 'none';
        } else if (isMobile) {
            // For mobile, slide up from bottom or hide entirely
            chatInterface.style.transform = isChatOpen ? 'translateY(0)' : 'translateY(calc(100% - 50px))';
        } else {
            // For desktop, partial slide to show header or full display
            chatInterface.style.transform = isChatOpen ? 'translateY(0)' : 'translateY(450px)';
        }
        
        // Update the toggle button icon
        toggleChat.innerHTML = isChatOpen 
            ? '<i class="fas fa-chevron-down"></i>' 
            : '<i class="fas fa-chevron-up"></i>';
    }

    // Update sessions in dropdown
    function updateSessionsDropdown(availableSessions) {
        sessions = availableSessions;
        
        if (!sessionSelector) return;
        
        // Remember selected value
        const currentValue = sessionSelector.value;
        
        // Clear existing options except the first one
        while (sessionSelector.options.length > 1) {
            sessionSelector.remove(1);
        }
        
        // Add sessions to dropdown
        sessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session._id;
            
            // Create formatted label with date
            let dateStr = '';
            try {
                dateStr = new Date(session.startTime).toLocaleDateString();
            } catch (e) {
                dateStr = 'Unknown date';
            }
            
            option.text = `${session.name} (${dateStr})`;
            option.selected = session._id === currentValue;
            sessionSelector.appendChild(option);
        });
    }

    // Update session selector based on current session
    function updateSessionSelector(sessionId) {
        if (sessionSelector && sessionId) {
            sessionSelector.value = sessionId;
        }
    }

    // Load available sessions
    async function loadAvailableSessions() {
        try {
            const response = await fetch('/api/sessions');
            if (response.ok) {
                const data = await response.json();
                sessions = data;
                updateSessionsDropdown(sessions);
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
        }
    }

    // Toggle chat open/closed
    toggleChat.addEventListener('click', () => {
        isChatOpen = !isChatOpen;
        updateChatVisibility();
        
        // If closing chat and in fullscreen mode, exit fullscreen
        if (!isChatOpen && isFullscreen) {
            exitFullscreen();
        }
    });

    // Click on header also toggles chat
    chatHeader.addEventListener('click', (e) => {
        // Only toggle if not clicking buttons
        if (!e.target.closest('button') && !e.target.closest('.chat-controls')) {
            isChatOpen = !isChatOpen;
            updateChatVisibility();
        }
    });

    // Send message on Enter key
    userMessage.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !isWaitingForResponse) {
            sendUserMessage();
        }
    });

    // Send message on button click
    sendMessage.addEventListener('click', () => {
        if (!isWaitingForResponse) {
            sendUserMessage();
        }
    });

    // Send message to the AI assistant
    async function sendUserMessage() {
        const message = userMessage.value.trim();
        if (!message) return;

        // Check if we have a session ID
        if (!currentSessionId || currentSessionId === 'None') {
            addSystemMessage("Please select a session before using the chat assistant.");
            return;
        }

        // Add user message to chat
        addMessage('user', message);
        userMessage.value = '';
        
        // Show typing indicator
        addTypingIndicator();
        isWaitingForResponse = true;

        try {
            const response = await fetch('/api/chat/message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    message: message
                })
            });

            // Remove typing indicator
            removeTypingIndicator();

            if (!response.ok) {
                throw new Error('Failed to get assistant response');
            }

            const data = await response.json();
            addMessage('assistant', data.message);
            
        } catch (error) {
            console.error('Error sending message:', error);
            addSystemMessage('Error: Could not connect to the AI assistant. Please try again later.');
        } finally {
            isWaitingForResponse = false;
        }
    }

    // Fetch chat history for a session
    async function fetchChatHistory(sessionId) {
        try {
            const response = await fetch(`/api/chat/${sessionId}`);
            if (response.ok) {
                const data = await response.json();
                
                // Clear existing messages
                chatMessages.innerHTML = '';
                
                // Add messages from history
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        if (msg.role === 'user' || msg.role === 'assistant') {
                            addMessage(msg.role, msg.content);
                        }
                    });
                } else {
                    // If no messages, add a welcome message for the selected session
                    const selectedSession = sessions.find(s => s._id === sessionId);
                    if (selectedSession) {
                        const sessionStatus = selectedSession.isActive ? 'active' : 'completed';
                        addMessage('assistant', 
                            `Hello! I'm your vibration analysis assistant for the ${sessionStatus} session "${selectedSession.name}". ` +
                            `Ask me about the vibration data, frequency analysis, or possible causes for specific patterns.`);
                    }
                }
                
                // Scroll to the bottom after loading messages
                scrollToBottom();
            }
        } catch (error) {
            console.error('Error fetching chat history:', error);
        }
    }

    // Parse markdown to HTML
    function parseMarkdown(text) {
        if (!text) return '';
        
        // Process code blocks
        text = text.replace(/```([^`]*?)```/gs, '<pre class="code-block"><code>$1</code></pre>');
        
        // Process inline code
        text = text.replace(/`([^`]*?)`/g, '<code class="inline-code">$1</code>');
        
        // Process bold text
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // Process italic text
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Process numbered lists
        text = text.replace(/^\d+\.\s+(.*?)$/gm, '<li>$1</li>');
        text = text.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
        
        // Process bullet lists
        text = text.replace(/^[\-\*]\s+(.*?)$/gm, '<li>$1</li>');
        text = text.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        
        // Process headings (h3 and h4 only for chat)
        text = text.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
        text = text.replace(/^#### (.*?)$/gm, '<h4>$1</h4>');
        
        // Process horizontal rule
        text = text.replace(/^---$/gm, '<hr>');
        
        // Process paragraphs (any line that's not already HTML)
        text = text.replace(/^(?!<[oulh]|<li|<pre|<hr)(.+)$/gm, '<p>$1</p>');
        
        return text;
    }
    
    // Add a message to the chat with markdown support
    function addMessage(role, text) {
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message message-${role}`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.innerHTML = parseMarkdown(text);
        messageElement.appendChild(messageContent);
        
        const messageTime = document.createElement('div');
        messageTime.className = 'message-time';
        messageTime.textContent = role === 'user' ? 'You' : 'AI Assistant';
        messageElement.appendChild(messageTime);
        
        chatMessages.appendChild(messageElement);
        scrollToBottom();
    }

    // Add a system message (gray, centered)
    function addSystemMessage(text) {
        const messageElement = document.createElement('div');
        messageElement.className = 'text-center py-2 text-sm text-gray-400';
        messageElement.textContent = text;
        chatMessages.appendChild(messageElement);
        scrollToBottom();
    }

    // Add typing indicator
    function addTypingIndicator() {
        const typingElement = document.createElement('div');
        typingElement.id = 'typingIndicator';
        typingElement.className = 'chat-message message-assistant';
        
        const typingDots = document.createElement('div');
        typingDots.innerHTML = '<span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span>';
        typingDots.className = 'typing-animation';
        
        typingElement.appendChild(typingDots);
        chatMessages.appendChild(typingElement);
        scrollToBottom();
    }

    // Remove typing indicator
    function removeTypingIndicator() {
        const typingElement = document.getElementById('typingIndicator');
        if (typingElement) {
            typingElement.remove();
        }
    }

    // Scroll chat to bottom - Improved with smooth scrolling
    function scrollToBottom() {
        const chatBody = document.getElementById('chatBody');
        if (chatBody) {
            chatBody.scrollTo({
                top: chatBody.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    // Initialize the chat component
    initChat();
    
    // Make functions available to external scripts
    window.selectChatSession = function(sessionId, sessionName) {
        currentSessionId = sessionId;
        updateSessionSelector(sessionId);
        fetchChatHistory(sessionId);
        if (sessionName) {
            addSystemMessage(`Connected to session: ${sessionName}`);
        }
    };
    
    // Expose fullscreen functions globally - Improved implementation
    window.chatFullscreen = function() {
        if (!isFullscreen) {
            toggleFullscreen();
        } else {
            // If already in fullscreen, make sure chat is completely visible
            isChatOpen = true;
            updateChatVisibility();
            scrollToBottom();
        }
    };
    
    window.chatExitFullscreen = function() {
        if (isFullscreen) exitFullscreen();
    };
});
