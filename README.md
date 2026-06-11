# recruitment-bot

招聘机器人 - Boss直聘简历筛选自动化服务

## 快速开始

1. 确保 kimi-webbridge daemon 正在运行：
   ```bash
   ~/.kimi-webbridge/bin/kimi-webbridge status
   ```
2. 在浏览器中登录 Boss直聘
3. 安装依赖并启动服务：
   ```bash
   npm install
   npm start
   ```

## 配置

编辑 `config/screening.yaml` 自定义筛选规则。

## 测试

```bash
npm test
```
