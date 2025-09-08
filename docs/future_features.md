# Future Features

This document outlines features that are planned for future releases of Vergo.

## Phase 2 – AI & Safety

-   **Toxicity Filter (real-time)**: Integrate Google’s Perspective API to block toxic messages.
    -   **Implementation Notes**: This will require a backend function to call the Perspective API to avoid exposing the API key on the client-side. The function will take the message text as input and return a toxicity score. If the score is above a certain threshold, the message will be blocked.
-   **Auto-blur NSFW Video**: If detected by an AI model, blur the video stream.
    -   **Implementation Notes**: This is a complex feature that would likely require a third-party service for real-time video analysis, such as Sightengine or Amazon Rekognition. Alternatively, a client-side TensorFlow.js model could be used, but this would be less accurate and more resource-intensive for the user's device.
-   **AI Moderator Bot (basic)**: Logs flagged conversations, alerts admin if abuse is detected.
    -   **Implementation Notes**: This would involve creating a backend service that listens for reports and other flags. When a conversation is flagged, the service would save the chat log to a secure location for review. If multiple flags are received for a user, an alert could be sent to an admin dashboard.

## Phase 3 – Social & Fun Features

-   **Mini-Games**: Add a simple trivia or “Would You Rather?” game.
    -   **Implementation Notes**: This would require a significant amount of work to implement the game logic and UI. The game state would need to be synchronized between the two users in real-time, likely using Firestore.
-   **Friend System**: Let users add each other as friends for future chats.
    -   **Implementation Notes**: This would require user accounts (moving beyond anonymous auth) and a way to manage friend requests and lists. This is a major feature that would require significant changes to the backend and UI.
-   **Public Chatrooms**: Topic-based rooms (e.g., Music, Coding, Gaming).
    -   **Implementation Notes**: This would be a significant architectural change, moving from one-on-one chats to many-to-many chats. It would require a different data model in Firestore and a new UI for browsing and joining chat rooms.

## Phase 4 – Global & Monetization

-   **Real-time Translation**: Translate text chat messages into the user’s preferred language.
    -   **Implementation Notes**: This would require integrating a translation service, such as the Google Translate API. Similar to the toxicity filter, this should be done on the backend to protect the API key.
-   **Virtual Avatars / Filters**: Allow AR/AI avatars for privacy.
    -   **Implementation Notes**: This is a very advanced feature that would likely require a third-party SDK, such as DeepAR or Banuba.
-   **Premium Membership System**: Add optional filters (gender, country, unlimited skips).
    -   **Implementation Notes**: This would require user accounts, a payment processing system (like Stripe), and a way to manage user subscriptions and permissions.
-   **Ads/Coins System**: Users can buy coins to unlock premium features or send gifts.
    -   **Implementation Notes**: This is another major feature that would require a payment system and a way to manage virtual currency.
