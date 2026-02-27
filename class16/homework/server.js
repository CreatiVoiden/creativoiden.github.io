const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// 配置固定保存密码（你可以自行修改）
const SAVE_PASSWORD = '123456';

// 配置静态文件目录
app.use(express.static('public'));
// 解析JSON请求体（增加参数，兼容更多格式）
app.use(express.json({ strict: false }));

// 作业数据保存目录
const DATA_DIR = path.join(__dirname, 'homework-data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// 1. 验证密码接口（新增）
app.post('/api/verify-password', (req, res) => {
    try {
        // 增加容错，避免密码参数不存在
        const { password } = req.body || {};
        if (!password) {
            return res.json({ success: false, message: '请输入密码' });
        }
        
        if (password === SAVE_PASSWORD) {
            res.json({ success: true, message: '密码验证通过' });
        } else {
            res.json({ success: false, message: '密码错误，请输入正确的保存密码' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: '验证失败：' + error.message });
    }
});

// 2. 保存作业数据接口（增加密码验证逻辑）
app.post('/api/save-homework', (req, res) => {
    try {
        const { dateStr, homeworkData, isHistoryMode } = req.body || {};
        
        // 关键限制1：历史模式下禁止保存
        if (isHistoryMode) {
            return res.status(403).json({ 
                success: false, 
                message: '当前处于查看历史作业模式，禁止保存操作！' 
            });
        }

        if (!dateStr || !homeworkData) {
            return res.status(400).json({ success: false, message: '缺少必要参数' });
        }

        // 构建文件路径（保存在homework-data目录下）
        const filePath = path.join(DATA_DIR, `${dateStr}.json`);
        
        // 写入文件
        fs.writeFileSync(filePath, JSON.stringify(homeworkData, null, 2), 'utf8');
        
        res.json({ 
            success: true, 
            message: `作业已保存到: ${filePath}`,
            filePath: filePath
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '保存失败：' + error.message });
    }
});

// 3. 读取作业数据接口
app.get('/api/load-homework', (req, res) => {
    try {
        const { dateStr } = req.query;
        if (!dateStr) {
            return res.status(400).json({ success: false, message: '请指定日期' });
        }

        // 构建文件路径
        const filePath = path.join(DATA_DIR, `${dateStr}.json`);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            return res.json({ success: false, message: `未找到${dateStr}的作业数据`, data: [] });
        }

        // 读取文件内容
        const data = fs.readFileSync(filePath, 'utf8');
        const homeworkData = JSON.parse(data);
        
        res.json({ 
            success: true, 
            message: `成功加载${dateStr}的作业数据`,
            data: homeworkData
        });
    } catch (error) {
        res.status(500).json({ success: false, message: '读取失败：' + error.message });
    }
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`服务器运行在: http://creativoiden.github.io:${PORT}`);
    console.log(`作业数据将保存在: ${DATA_DIR}`);
    console.log(`保存作业的固定密码: ${SAVE_PASSWORD}`);
});