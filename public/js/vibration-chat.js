/**
 * Z-Axis Vibration Monitor - Chat Interface JavaScript
 * Handles chat interactions, session selection, and communications with the AI assistant
 */

// Global chat variables
let currentChatSession = null;
let isChatFullscreen = false;
let chatMessages = [];

document.addEventListener('DOMContentLoaded', () => {
    // Initialize chat interface
    initChatInterface();
});

/**
 * Initialize the chat interface elements and event listeners
 */
function initChatInterface() {
    const chatInterface = document.getElementById('chatInterface');
    const chatHeader = document.getElementById('chatHeader');
    const toggleChat = document.getElementById('toggleChat');
    const userMessage = document.getElementById('userMessage');
    const sendMessage = document.getElementById('sendMessage');
    const chatBody = document.getElementById('chatBody');
    
    // Create session selector in chat body
    createChatSessionSelector();
    
    // Toggle chat visibility
    toggleChat.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleChatVisibility();
    });
    
    // Toggle chat on header click
    chatHeader.addEventListener('click', (e) => {
        if (e.target !== toggleChat && !toggleChat.contains(e.target)) {
            toggleChatVisibility();
        }
    });
    
    // Double click on header to toggle fullscreen
    chatHeader.addEventListener('dblclick', (e) => {
        toggleChatFullscreen();
    });

    // Add fullscreen toggle button to chat header
    const fullscreenButton = document.createElement('button');
    fullscreenButton.title = "Toggle Fullscreen";
    fullscreenButton.className = "text-gray-400 hover:text-gray-200 p-1 rounded-full hover:bg-gray-600 transition-colors mx-1";
    fullscreenButton.innerHTML = '<i class="fas fa-expand"></i>';
    fullscreenButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleChatFullscreen();
    });
    
    chatHeader.querySelector('div:last-child').prepend(fullscreenButton);
    
    // Send message when button is clicked
    sendMessage.addEventListener('click', () => {
        sendChatMessage();
    });
    
    // Send message when Enter key is pressed
    userMessage.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

/**
 * Create a session selector dropdown in the chat interface
 */
function createChatSessionSelector() {
    const chatMessages = document.getElementById('chatMessages');
    
    // Create a select element for sessions
    const sessionSelectorContainer = document.createElement('div');
    sessionSelectorContainer.className = 'mb-4';
    
    const sessionSelector = document.createElement('select');
    sessionSelector.id = 'chatSessionSelector';
    sessionSelector.className = 'w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select a session to analyze...';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    sessionSelector.appendChild(defaultOption);
    
    sessionSelectorContainer.appendChild(sessionSelector);
    
    // If chatMessages already has a session selector, replace it
    const existingSelector = document.querySelector('#chatSessionSelector');
    if (existingSelector) {
        existingSelector.parentElement.replaceWith(sessionSelectorContainer);
    } else {
        // Otherwise prepend it to chat messages
        chatMessages.prepend(sessionSelectorContainer);
    }
    
    // Add event listener to session selector
    sessionSelector.addEventListener('change', (e) => {
        const sessionId = e.target.value;
        if (sessionId) {
            loadChatSession(sessionId);
        }
    });
}

/**
 * Update the session selector with available sessions
 * @param {Array} sessions - List of sessions from the server
 */
function updateChatSessionSelector(sessions) {
    const sessionSelector = document.getElementById('chatSessionSelector');
    if (!sessionSelector) return;
    
    // Keep only the default option
    while (sessionSelector.options.length > 1) {
        sessionSelector.remove(1);
    }
    
    // Add options for each session
    sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session._id;
        
        // Format date string
        const sessionDate = new Date(session.startTime || session.createdAt).toLocaleDateString();
        option.textContent = `${session.name} (${sessionDate})`;
        
        sessionSelector.appendChild(option);
    });
    
    // If current chat session is selected, select it in the dropdown
    if (currentChatSession) {
        sessionSelector.value = currentChatSession;
    }
}

/**
 * Load chat history for a selected session
 * @param {string} sessionId - The ID of the selected session
 */
function loadChatSession(sessionId) {
    if (!sessionId) return;
    
    // Show loading indicator
    showChatLoadingIndicator();
    
    // Request chat history from the server
    fetch(`/api/chat/${sessionId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Error fetching chat history');
            }
            return response.json();
        })
        .then(data => {
            // Set current chat session
            currentChatSession = sessionId;
            
            // Set chat messages
            chatMessages = data.messages || [];
            
            // Display chat messages
            displayChatMessages();
            
            // Request session data for the AI context
            // This will update the UI in the main interface
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({
                    type: 'get_session_data',
                    sessionId: sessionId
                }));
            }
            
            // Enable chat input
            document.getElementById('userMessage').disabled = false;
            document.getElementById('sendMessage').disabled = false;
            document.querySelector('#chatInput .text-xs').textContent = 'Ask about your vibration data...';
            
            // Show welcome message if no messages
            if (chatMessages.length === 0) {
                addAssistantMessage("Hello! I'm your vibration analysis assistant. How can I help you analyze this session's data?");
            }
        })
        .catch(error => {
            console.error('Error loading chat session:', error);
            showNotification('Error loading chat session. Please try again.', 'error');
        })
        .finally(() => {
            removeChatLoadingIndicator();
        });
}

/**
 * Display chat messages in the chat interface
 */
function displayChatMessages() {
    const chatMessagesContainer = document.getElementById('chatMessages');
    
    // Clear existing messages except for the session selector
    const sessionSelector = chatMessagesContainer.querySelector('#chatSessionSelector')?.parentElement;
    chatMessagesContainer.innerHTML = '';
    
    if (sessionSelector) {
        chatMessagesContainer.appendChild(sessionSelector);
    }
    
    // Add a date separator for better conversation context
    let lastDate = null;
    
    // Display each message with date separators
    chatMessages.forEach(message => {
        const messageDate = new Date(message.timestamp);
        const dateStr = messageDate.toLocaleDateString();
        
        // Add date separator if this is a new day
        if (lastDate !== dateStr) {
            const separator = document.createElement('div');
            separator.className = 'flex justify-center my-4';
            separator.innerHTML = `
                <div class="bg-gray-800 text-gray-400 text-xs px-3 py-1 rounded-full">
                    ${formatDateForDisplay(messageDate)}
                </div>
            `;
            chatMessagesContainer.appendChild(separator);
            lastDate = dateStr;
        }
        
        if (message.role === 'user') {
            addUserMessageToUI(message.content, message.timestamp);
        } else if (message.role === 'assistant') {
            addAssistantMessageToUI(message.content, message.timestamp);
        }
    });
    
    // If no messages, show a welcome placeholder
    if (chatMessages.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'flex flex-col items-center justify-center h-64 text-center';
        emptyState.innerHTML = `
            <div class="text-blue-400 text-5xl mb-4">
                <i class="fas fa-robot"></i>
            </div>
            <h3 class="text-gray-300 text-lg font-medium mb-2">Vibration Analysis Assistant</h3>
            <p class="text-gray-400 max-w-sm">Ask questions about your vibration data or get insights on the test results.</p>
        `;
        chatMessagesContainer.appendChild(emptyState);
    }
    
    // Scroll to bottom
    scrollChatToBottom();
}

/**
 * Format date for display in chat
 * @param {Date} date - The date to format
 * @returns {string} - Formatted date string
 */
function formatDateForDisplay(date) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === now.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString(undefined, { 
            weekday: 'short', 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

/**
 * Add a user message to the chat UI
 * @param {string} message - The user message
 * @param {Date|string} [timestamp] - Optional timestamp
 */
function addUserMessageToUI(message, timestamp = null) {
    const chatMessagesContainer = document.getElementById('chatMessages');
    
    const messageElement = document.createElement('div');
    messageElement.className = 'flex justify-end message-container';
    
    // Get current time for timestamp
    const messageTime = timestamp ? new Date(timestamp) : new Date();
    const timeStr = messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        <div class="bg-blue-600 text-white rounded-lg py-3 px-4 max-w-[85%] shadow-lg user-message">
            <div class="flex items-center mb-2">
                <div class="font-semibold">You</div>
                <div class="text-xs text-blue-200 ml-auto">${timeStr}</div>
            </div>
            <p class="break-words">${escapeHTML(message)}</p>
        </div>
    `;
    
    chatMessagesContainer.appendChild(messageElement);
    scrollChatToBottom();
}

/**
 * Add an assistant message to the chat UI
 * @param {string} message - The assistant message
 * @param {Date|string} [timestamp] - Optional timestamp
 */
function addAssistantMessageToUI(message, timestamp = null) {
    const chatMessagesContainer = document.getElementById('chatMessages');
    
    const messageElement = document.createElement('div');
    messageElement.className = 'flex message-container';
    
    // Get current time for timestamp
    const messageTime = timestamp ? new Date(timestamp) : new Date();
    const timeStr = messageTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Convert markdown to HTML for assistant messages with enhanced options
    const formattedMessage = marked.parse(message, {
        gfm: true,
        breaks: true,
        headerIds: true,
        smartLists: true
    });
    
    messageElement.innerHTML = `
        <div class="bg-gray-700 text-gray-100 rounded-lg py-3 px-4 max-w-[85%] shadow-lg assistant-message">
            <div class="flex items-center mb-2">
                <div class="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mr-2">
                    <i class="fas fa-robot text-xs"></i>
                </div>
                <div class="font-semibold text-blue-300">Assistant</div>
                <div class="text-xs text-gray-400 ml-auto">${timeStr}</div>
            </div>
            <div class="markdown-content message-content">${formattedMessage}</div>
        </div>
    `;
    
    // After rendering, process any special elements for enhanced display
    const processedMessage = messageElement.querySelector('.markdown-content');
    
    // Process tables for better styling
    const tables = processedMessage.querySelectorAll('table');
    tables.forEach(table => {
        table.classList.add('table-auto');
        const wrapper = document.createElement('div');
        wrapper.className = 'overflow-x-auto my-3';
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
    });
    
    chatMessagesContainer.appendChild(messageElement);
    scrollChatToBottom();
}

/**
 * Add a user message to the UI and chat history
 * @param {string} message - The user message
 */
function addUserMessage(message) {
    if (!message || !currentChatSession) return;
    
    // Add to UI
    addUserMessageToUI(message);
    
    // Add to local messages array
    chatMessages.push({
        role: 'user',
        content: message,
        timestamp: new Date()
    });
}

/**
 * Add an assistant message to the UI and chat history
 * @param {string} message - The assistant message
 */
function addAssistantMessage(message) {
    if (!message || !currentChatSession) return;
    
    // Add to UI
    addAssistantMessageToUI(message);
    
    // Add to local messages array
    chatMessages.push({
        role: 'assistant',
        content: message,
        timestamp: new Date()
    });
}

/**
 * Send a chat message to the server
 */
function sendChatMessage() {
    const userMessageInput = document.getElementById('userMessage');
    const message = userMessageInput.value.trim();
    
    if (!message || !currentChatSession) return;
    
    // Clear input
    userMessageInput.value = '';
    
    // Add user message to UI
    addUserMessage(message);
    
    // Show typing indicator
    showTypingIndicator();
    
    // Send message to server
    fetch('/api/chat/message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            sessionId: currentChatSession,
            message: message
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Error sending message');
            }
            return response.json();
        })        .then(data => {
            // Remove typing indicator
            removeTypingIndicator();
            
            // Add assistant response to UI
            addAssistantMessage(data.message);
        })
        .catch(error => {
            console.error('Error sending message:', error);
            removeTypingIndicator();
            showNotification('Error sending message. Please try again.', 'error');
        });
}

/**
 * Show a typing indicator in the chat
 */
function showTypingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    
    // Create typing indicator
    const indicator = document.createElement('div');
    indicator.id = 'typingIndicator';
    indicator.className = 'flex message-container';
    
    indicator.innerHTML = `
        <div class="bg-gray-700 text-gray-400 rounded-lg py-3 px-4 max-w-[85%] shadow-lg">
            <div class="flex items-center">
                <div class="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center mr-2">
                    <i class="fas fa-robot text-xs"></i>
                </div>
                <div class="font-semibold text-blue-300 mr-2">Assistant</div>
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
    `;
    
    chatMessages.appendChild(indicator);
    scrollChatToBottom();
}

/**
 * Remove the typing indicator from the chat
 */
function removeTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Show a loading indicator in the chat
 */
function showChatLoadingIndicator() {
    const chatMessages = document.getElementById('chatMessages');
    
    // Keep the session selector
    const sessionSelector = chatMessages.querySelector('#chatSessionSelector')?.parentElement;
    chatMessages.innerHTML = '';
    
    if (sessionSelector) {
        chatMessages.appendChild(sessionSelector);
    }
    
    // Create loading indicator
    const indicator = document.createElement('div');
    indicator.id = 'chatLoadingIndicator';
    indicator.className = 'flex items-center justify-center py-4';
    
    indicator.innerHTML = `
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500"></div>
        <span class="ml-2 text-gray-400">Loading chat history...</span>
    `;
    
    chatMessages.appendChild(indicator);
}

/**
 * Remove the chat loading indicator
 */
function removeChatLoadingIndicator() {
    const indicator = document.getElementById('chatLoadingIndicator');
    if (indicator) {
        indicator.remove();
    }
}

/**
 * Toggle chat visibility
 */
function toggleChatVisibility() {
    const chatInterface = document.getElementById('chatInterface');
    const toggleIcon = document.querySelector('#toggleChat i');
    
    if (isChatFullscreen) {
        // If chat is in fullscreen, first exit fullscreen
        toggleChatFullscreen();
        return;
    }
    
    if (chatInterface.style.transform === 'translateY(0px)' || chatInterface.style.transform === 'none') {
        // Hide chat (keep header visible)
        chatInterface.style.transform = 'translateY(450px)';
        toggleIcon.className = 'fas fa-chevron-up';
    } else {
        // Show chat
        chatInterface.style.transform = 'translateY(0)';
        toggleIcon.className = 'fas fa-chevron-down';
    }
}

/**
 * Toggle fullscreen mode for the chat
 */
function toggleChatFullscreen() {
    const chatInterface = document.getElementById('chatInterface');
    const body = document.body;
    const fullscreenButton = document.querySelector('button[title="Toggle Fullscreen"] i');
    
    if (isChatFullscreen) {
        // Exit fullscreen
        chatInterface.classList.remove('chat-fullscreen');
        body.classList.remove('chat-active');
        isChatFullscreen = false;
        fullscreenButton.className = 'fas fa-expand';
    } else {
        // Enter fullscreen
        chatInterface.style.transform = 'translateY(0)'; // Ensure chat is visible
        chatInterface.classList.add('chat-fullscreen');
        body.classList.add('chat-active');
        isChatFullscreen = true;
        fullscreenButton.className = 'fas fa-compress';
    }
    
    // Scroll to bottom after transition
    setTimeout(() => {
        scrollChatToBottom();
    }, 300);
}

/**
 * Scroll chat to the bottom
 */
function scrollChatToBottom() {
    const chatBody = document.getElementById('chatBody');
    chatBody.scrollTop = chatBody.scrollHeight;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} html - String to escape
 * @returns {string} - Escaped string
 */
function escapeHTML(html) {
    const div = document.createElement('div');
    div.textContent = html;
    return div.innerHTML;
}

/**
 * Add a session to the chat UI and select it
 * @param {Object} session - Session object
 * @param {Boolean} selectIt - Whether to select this session
 */
function addSessionToChat(session, selectIt = false) {
    const sessionSelector = document.getElementById('chatSessionSelector');
    if (!sessionSelector) return;
    
    // Check if session already exists in the selector
    let exists = false;
    for (let i = 0; i < sessionSelector.options.length; i++) {
        if (sessionSelector.options[i].value === session._id) {
            exists = true;
            break;
        }
    }
    
    // Add if it doesn't exist
    if (!exists) {
        const option = document.createElement('option');
        option.value = session._id;
        
        // Format date string
        const sessionDate = new Date(session.startTime || session.createdAt).toLocaleDateString();
        option.textContent = `${session.name} (${sessionDate})`;
        
        sessionSelector.appendChild(option);
    }
    
    // Select the session if specified
    if (selectIt) {
        sessionSelector.value = session._id;
        loadChatSession(session._id);
    }
}

// Export functions to be available globally
window.updateChatSessionSelector = updateChatSessionSelector;
window.addSessionToChat = addSessionToChat;
