import React from 'react';
import EntryForm from './components/EntryForm';
import ChatView from './components/ChatView';
import useChatService from './hooks/useChatService';
import './App.css';

function App() {
  const {
    status,
    error,
    chatRoomId,
    messages,
    startSearching,
    leaveChat,
    sendMessage,
  } = useChatService();

  const [isPartnerConnected, setIsPartnerConnected] = React.useState(false);

  // This effect will help manage the UI state based on the chatRoomId
  React.useEffect(() => {
    if (chatRoomId) {
      setIsPartnerConnected(true);
    } else {
      setIsPartnerConnected(false);
    }
  }, [chatRoomId]);

  const handleStartChat = (formData) => {
    startSearching(formData);
  };

  const handleNext = () => {
    leaveChat();
  };

  // Render a loading indicator while the service is initializing
  if (status === 'Initializing...' || status === 'Authenticating...') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg">{status}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-lg text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-100 min-h-screen font-sans">
      {!chatRoomId ? (
        <div className="pt-10">
          <EntryForm onSubmit={handleStartChat} />
          {status && <p className="text-center text-gray-600 p-4">{status}</p>}
        </div>
      ) : (
        <ChatView
          messages={messages}
          onSendMessage={sendMessage}
          onNext={handleNext}
          status={status}
          isPartnerConnected={isPartnerConnected}
        />
      )}
    </div>
  );
}

export default App;
