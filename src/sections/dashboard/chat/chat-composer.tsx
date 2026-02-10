import type { FC } from 'react';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Divider } from '@mui/material';
import { paths } from '../../../paths';
import { useDispatch } from '../../../store';
import { thunks } from '../../../thunks/chat';
import type { Contact } from '../../../types/chat';
import { ChatComposerRecipients } from './chat-composer-recipients';
import { ChatMessageAdd } from './chat-message-add';

const useRecipients = () => {
  const [recipients, setRecipients] = useState<Contact[]>([]);

  const onRecipientAdd = useCallback(
    (recipient: Contact): void => {
      setRecipients((prevState) => {
        const found = prevState.find((_recipient) => _recipient.id === recipient.id);

        if (found) {
          return prevState;
        }

        return [...prevState, recipient];
      });
    },
    []
  );

  const onRecipientRemove = useCallback(
    (recipientId: string): void => {
      setRecipients((prevState) => {
        return prevState.filter((recipient) => recipient.id !== recipientId);
      });
    },
    []
  );

  return {
    onRecipientAdd,
    onRecipientRemove,
    recipients
  };
};

interface ChatComposerProps {}

export const ChatComposer: FC<ChatComposerProps> = (props) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const { onRecipientAdd, onRecipientRemove, recipients } = useRecipients();

  const handleSend = useCallback(
    async (body: string): Promise<void> => {
      const recipientIds = recipients.map((recipient) => recipient.id);

      let threadId: string;

      try {
        // Handle send message and redirect to the new thread
        threadId = await dispatch(thunks.addMessage({
          recipientIds,
          body
        })) as unknown as string;
      } catch (err) {
        console.error(err);
        return;
      }

      router.push(paths.dashboard.chat + `?threadKey=${threadId}`);
    },
    [dispatch, router, recipients]
  );

  const canAddMessage = recipients.length > 0;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1
      }}
      {...props}
    >
      <ChatComposerRecipients
        onRecipientAdd={onRecipientAdd}
        onRecipientRemove={onRecipientRemove}
        recipients={recipients}
      />
      <Divider />
      <Box sx={{ flexGrow: 1 }} />
      <Divider />
      <ChatMessageAdd
        disabled={!canAddMessage}
        onSend={handleSend}
      />
    </Box>
  );
};
