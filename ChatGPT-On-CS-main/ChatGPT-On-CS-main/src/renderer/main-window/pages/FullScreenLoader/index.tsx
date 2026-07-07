import React, { useState, useEffect } from 'react';
import { Center, Text } from '@chakra-ui/react';
import Loader from '../../components/Loader';

const FullScreenLoader = () => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <Center h="100vh" w="100vw" bg="white" flexDirection="column">
      <Text fontSize="lg" mt="4" zIndex={10} pb={40}>
        正在启动本地服务，请稍候...
      </Text>
      <Text fontSize="sm" zIndex={10} color="gray.500">
        已等待 {elapsed} 秒
      </Text>
      {elapsed > 15 && (
        <Text fontSize="sm" zIndex={10} color="orange.500" mt={2}>
          启动时间较长，正在初始化服务组件...
        </Text>
      )}
      {elapsed > 30 && (
        <Text fontSize="sm" zIndex={10} color="red.500" mt={2}>
          如果持续超过 1 分钟，请检查后端服务是否正常运行
        </Text>
      )}
      <Loader />
    </Center>
  );
};

export default React.memo(FullScreenLoader);
