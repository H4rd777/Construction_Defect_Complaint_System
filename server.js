const express = require('express');
const OpenAI = require('openai');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY;

// 1. 미들웨어 설정
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 2. MySQL 연결 설정
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 3. OpenAI 설정
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- API 경로 시작 ---

// [기능 1] 회원가입 API (기본 role은 'user'로 가정)
app.post('/api/signup', async (req, res) => {
  const { userid, password, name } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    // role 컬럼이 DB에 추가되어 있어야 합니다. (기본값 'user')
    const query = "INSERT INTO users (userid, password, name, role) VALUES (?, ?, ?, 'user')";
    
    db.execute(query, [userid, hashedPassword, name], (err, result) => {
      if (err) return res.status(500).json({ error: "아이디 중복 또는 DB 에러" });
      res.json({ success: true, message: "회원가입이 완료되었습니다." });
    });
  } catch (error) {
    res.status(500).json({ error: "서버 에러" });
  }
});

// [기능 2] 로그인 API (⭐ role 정보를 포함하도록 수정)
app.post('/api/login', (req, res) => {
  const { userid, password } = req.body;
  const query = "SELECT * FROM users WHERE userid = ?";

  db.execute(query, [userid], async (err, results) => {
    if (err || results.length === 0) return res.status(401).json({ error: "사용자를 찾을 수 없습니다." });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      // 토큰에 권한(role) 정보 포함
      const token = jwt.sign({ id: user.id, userid: user.userid, role: user.role }, SECRET_KEY, { expiresIn: '1d' });
      
      // ✅ 클라이언트에 role 정보를 함께 내려주어 화면 분기 처리를 가능하게 함
      res.json({ 
        success: true, 
        token, 
        name: user.name, 
        id: user.id, 
        role: user.role // 'admin' 또는 'user'
      });
    } else {
      res.status(401).json({ error: "비밀번호가 일치하지 않습니다." });
    }
  });
});

// [기능 3] AI 채팅 API (기존 유지)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, image } = req.body;
    const apiMessages = [
      { 
        role: "system", 
        content: `당신은 건설 하자 데이터 추출 전문가입니다. 사진에서 사람은 절대 언급하지 말고 사진을 분석하여 반드시 다음 정보만을 리스트로 답변하세요:
        1. 하자의 종류, 
        2. 심각도 점수(1~10)점, 
        3. 예상 보수 비용 (원), 
        4. 권장 보수 방법 2가지, 
        5. 관련 법규(몇항 몇조)`
      },
      ...messages
    ];

    if (image) {
      const lastIdx = apiMessages.length - 1;
      const originalText = apiMessages[lastIdx].content;
      apiMessages[lastIdx].content = [
        { type: "text", text: originalText },
        { type: "image_url", image_url: { url: image } }
      ];
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: apiMessages,
      max_tokens: 1000,
    });

    res.json({ result: completion.choices[0].message.content });
  } catch (error) {
    res.status(500).json({ error: "AI 분석 중 에러 발생" });
  }
});

// [기능 4] 하자 접수 데이터 저장 (기존 유지)
app.post('/api/register-report', (req, res) => {
  const { user_id, analysis_result, image_data } = req.body;
  const query = "INSERT INTO reports (user_id, analysis_result, image_data) VALUES (?, ?, ?)";

  db.execute(query, [user_id, analysis_result, image_data], (err, result) => {
    if (err) return res.status(500).json({ error: "DB 저장 실패" });
    res.json({ success: true, reportId: result.insertId });
  });
});

// [기능 5] 내 접수 내역 리스트 (기존 유지)
app.get('/api/my-reports/:user_id', (req, res) => {
  const userId = req.params.user_id;
  const query = "SELECT id, analysis_result, image_data, status, created_at FROM reports WHERE user_id = ? ORDER BY created_at DESC";

  db.execute(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: "목록 조회 실패" });
    res.json(results);
  });
});

// ⭐ [기능 6] 관리자용: 모든 사용자 접수 내역 가져오기 API 추가
app.get('/api/admin/all-reports', (req, res) => {
  // JOIN을 사용하여 작성자 이름(name)까지 함께 가져옵니다.
  const query = `
    SELECT r.id, r.analysis_result, r.image_data, r.status, r.created_at, u.name as user_name 
    FROM reports r 
    JOIN users u ON r.user_id = u.id 
    ORDER BY r.created_at DESC`;

  db.execute(query, (err, results) => {
    if (err) return res.status(500).json({ error: "전체 목록 조회 실패" });
    res.json(results);
  });
});

// ⭐ [기능 7] 관리자용: 하자 처리 상태 업데이트 API 추가
app.put('/api/report-status/:id', (req, res) => {
  const reportId = req.params.id;
  const { status } = req.body; // 예: '보수중', '처리 완료'
  const query = "UPDATE reports SET status = ? WHERE id = ?";

  db.execute(query, [status, reportId], (err, result) => {
    if (err) return res.status(500).json({ error: "상태 업데이트 실패" });
    res.json({ success: true, message: "상태가 변경되었습니다." });
  });
});

app.listen(PORT, () => {
  console.log(`✅ 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});