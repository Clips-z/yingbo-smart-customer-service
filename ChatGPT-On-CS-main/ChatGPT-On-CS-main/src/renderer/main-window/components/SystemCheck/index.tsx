import React, { useEffect, useState } from 'react';
import {
  Button,
  VStack,
  Text,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
  useDisclosure,
} from '@chakra-ui/react';
import { useWebSocketContext } from '../../hooks/useBroadcastContext';

const SystemCheck = () => {
  const [humanTaskMsg, setHumanTaskMsg] = useState<string>('');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = React.useRef<any>();
  const { registerEventHandler } = useWebSocketContext();

  useEffect(() => {
    const unregister = registerEventHandler((message) => {
      if (message.event === 'human_task') {
        if (!message.data) {
          return;
        }

        window.electron.ipcRenderer.sendMessage(
          'notification',
          '警告',
          '有需要人工处理的消息，请手动处理，注意处理完成后请取消暂停勾选。',
        );

        const data = message.data as {
          message: string;
          value: string;
          type: string;
        };

        if (data.type === 'strategy') {
          setHumanTaskMsg(data.message);
          onOpen();
        } else if (data.type === 'system') {
          setHumanTaskMsg(data.message);
          onOpen();
        }
      }
    });

    // 组件卸载时注销事件处理器
    return () => unregister();
  }, [registerEventHandler]); // eslint-disable-line

  // 仅在「需要人工处理的消息」事件触发时弹出（运行时上下文提示，非启动阻塞弹窗）
  return (
    <AlertDialog
      isOpen={isOpen}
      leastDestructiveRef={cancelRef}
      onClose={onClose}
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            手动处理消息
          </AlertDialogHeader>

          <AlertDialogBody>
            <VStack>
              <Text>软件已暂停</Text>
              <Text>{humanTaskMsg}</Text>
              <Text>
                平台有需要人工处理的消息，请手动处理，注意处理完成后请取消暂停勾选。
              </Text>
            </VStack>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button ref={cancelRef} onClick={onClose}>
              确定
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};

export default SystemCheck;
