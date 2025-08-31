interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Conversation {
  id: string;
  userId: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

class ConversationManager {
  private conversations = new Map<string, Conversation>();

  /**
   * Get or create a conversation for a user
   */
  getConversation(userId: string): Conversation {
    if (!this.conversations.has(userId)) {
      const conversation: Conversation = {
        id: `conv_${userId}_${Date.now()}`,
        userId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.conversations.set(userId, conversation);
    }
    return this.conversations.get(userId)!;
  }

  /**
   * Add a user message to the conversation
   */
  addUserMessage(userId: string, content: string): void {
    const conversation = this.getConversation(userId);
    conversation.messages.push({
      role: 'user',
      content,
      timestamp: Date.now(),
    });
    conversation.updatedAt = Date.now();
  }

  /**
   * Add an assistant message to the conversation
   */
  addAssistantMessage(userId: string, content: string): void {
    const conversation = this.getConversation(userId);
    conversation.messages.push({
      role: 'assistant',
      content,
      timestamp: Date.now(),
    });
    conversation.updatedAt = Date.now();
  }

  /**
   * Get conversation history for a user (last N messages)
   */
  getConversationHistory(userId: string, limit: number = 20): Message[] {
    const conversation = this.getConversation(userId);
    return conversation.messages.slice(-limit);
  }

  /**
   * Get conversation history as formatted text for AI context
   */
  getConversationContext(userId: string, limit: number = 10): string {
    const messages = this.getConversationHistory(userId, limit);
    if (messages.length === 0) {
      return '';
    }

    const context = messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    return `\n\nPrevious conversation:\n${context}\n\n`;
  }

  /**
   * Clear conversation history for a user
   */
  clearConversation(userId: string): void {
    this.conversations.delete(userId);
  }

  /**
   * Get all active conversations (for debugging/admin)
   */
  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  /**
   * Get conversation stats
   */
  getStats(): { totalConversations: number; totalMessages: number } {
    const conversations = Array.from(this.conversations.values());
    const totalMessages = conversations.reduce((sum, conv) => sum + conv.messages.length, 0);

    return {
      totalConversations: conversations.length,
      totalMessages,
    };
  }
}

// Export singleton instance
export const conversationManager = new ConversationManager();
export type { Message, Conversation };
