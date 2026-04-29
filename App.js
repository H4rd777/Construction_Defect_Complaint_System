import React, { useState, useEffect } from 'react';
import axios from 'axios';

function ConstructionChatbot() {
  // --- 1. 상태 관리 ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null); // 'admin' 또는 'user' 저장
  const [authView, setAuthView] = useState('login');
  const [authData, setAuthData] = useState({ userid: '', password: '', name: '' });

  // 공통 상태
  const [loading, setLoading] = useState(false);
  
  // 사용자용 상태
  const [preview, setPreview] = useState(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [currentImageBase64, setCurrentImageBase64] = useState(null);
  const [reports, setReports] = useState([]);

  // 관리자용 상태
  const [allReports, setAllReports] = useState([]);

  // 페이지 로드 시 로그인 확인
  useEffect(() => {
    const token = localStorage.getItem('token');
    const name = localStorage.getItem('userName');
    const id = localStorage.getItem('userId');
    const savedRole = localStorage.getItem('userRole');

    if (token) {
      setIsLoggedIn(true);
      setUser({ name, id });
      setRole(savedRole);
      
      if (savedRole === 'admin') {
        fetchAllReports();
      } else {
        fetchMyReports(id);
      }
    }
  }, []);

  // --- 2. 데이터 가져오기 API ---

  // [사용자용] 내 리포트만 가져오기
  const fetchMyReports = async (userId) => {
    try {
      const targetId = userId || user?.id;
      const res = await axios.get(`http://localhost:3000/api/my-reports/${targetId}`);
      setReports(res.data);
    } catch (err) { console.error("내 목록 로딩 실패"); }
  };

  // [관리자용] 모든 사용자의 리포트 가져오기
  const fetchAllReports = async () => {
    try {
      const res = await axios.get('http://localhost:3000/api/admin/all-reports');
      setAllReports(res.data);
    } catch (err) { console.error("전체 목록 로딩 실패"); }
  };

  // [관리자용] 상태 업데이트 (대기 -> 완료 등)
  const updateStatus = async (id, newStatus) => {
    try {
      await axios.put(`http://localhost:3000/api/report-status/${id}`, { status: newStatus });
      alert(`상태가 [${newStatus}]로 변경되었습니다.`);
      fetchAllReports(); // 목록 갱신
    } catch (err) { alert("상태 변경 실패"); }
  };

  // --- 3. 인증 로직 (로그인/회원가입) ---
  const handleAuth = async () => {
    const url = authView === 'login' ? '/api/login' : '/api/signup';
    try {
      const res = await axios.post(`http://localhost:3000${url}`, authData);
      if (authView === 'login') {
        // 백엔드에서 보낸 role 정보를 저장
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('userName', res.data.name);
        localStorage.setItem('userId', res.data.id);
        localStorage.setItem('userRole', res.data.role); // ⭐ 중요

        setUser({ name: res.data.name, id: res.data.id });
        setRole(res.data.role);
        setIsLoggedIn(true);

        if (res.data.role === 'admin') fetchAllReports();
        else fetchMyReports(res.data.id);
      } else {
        alert("가입 성공! 로그인 해주세요.");
        setAuthView('login');
      }
    } catch (err) {
      alert(err.response?.data?.error || "오류 발생");
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    setIsLoggedIn(false);
    setUser(null);
    setRole(null);
    setMessages([]);
    setReports([]);
    setAllReports([]);
  };

  // --- 4. 사용자 전용 기능 (채팅/저장) ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setCurrentImageBase64(canvas.toDataURL('image/jpeg', 0.7));
      };
    };
  };

  const sendMessage = async () => {
    if (!input && !currentImageBase64) return;
    setLoading(true);
    const userMessage = { role: "user", content: input || "사진을 분석해줘." };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    try {
      const res = await axios.post('http://localhost:3000/api/chat', {
        messages: updatedMessages,
        image: currentImageBase64
      });
      setMessages(prev => [...prev, { role: "assistant", content: res.data.result }]);
    } catch (err) { alert("분석 중 오류 발생"); }
    finally { setLoading(false); }
  };

  const saveToDB = async (aiContent) => {
    try {
      await axios.post('http://localhost:3000/api/register-report', {
        user_id: user.id,
        analysis_result: aiContent,
        image_data: currentImageBase64
      });
      alert("성공적으로 접수되었습니다!");
      fetchMyReports();
    } catch (err) { alert("DB 저장 실패"); }
  };

  // --- 5. UI 분기 조건문 ---

  // [1] 로그인 전 화면
  if (!isLoggedIn) {
    return (
      <div style={{ padding: '50px', maxWidth: '400px', margin: 'auto' }}>
        <h2>{authView === 'login' ? '🔑 로그인' : '📝 회원가입'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {authView === 'signup' && <input placeholder="이름" onChange={e => setAuthData({...authData, name: e.target.value})} />}
          <input placeholder="아이디" onChange={e => setAuthData({...authData, userid: e.target.value})} />
          <input type="password" placeholder="비밀번호" onChange={e => setAuthData({...authData, password: e.target.value})} />
          <button onClick={handleAuth}>{authView === 'login' ? '로그인' : '가입하기'}</button>
          <p onClick={() => setAuthView(authView === 'login' ? 'signup' : 'login')} style={{ cursor: 'pointer', textAlign: 'center', color: 'blue' }}>
            {authView === 'login' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있나요? 로그인'}
          </p>
        </div>
      </div>
    );
  }

  // [2] 로그인 후: 관리자용 화면 (Admin Dashboard)
  if (role === 'admin') {
    return (
      <div style={{ padding: '20px', maxWidth: '1000px', margin: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid red', paddingBottom: '10px' }}>
          <h2>🚩 관리자 마스터 대시보드</h2>
          <button onClick={handleLogout}>로그아웃</button>
        </header>
        <p>시스템에 접수된 모든 건설하자 민원처리 상태를 관리합니다.</p>
        
        <table border="1" style={{ width: '100%', borderCollapse: 'collapse', marginTop: '20px' }}>
          <thead style={{ backgroundColor: '#f4f4f4' }}>
            <tr>
              <th>번호</th><th>작성자</th><th>사진</th><th>분석내용 </th><th>상태</th><th>작업</th>
            </tr>
          </thead>
          <tbody>
            {allReports.map(report => (
              <tr key={report.id} style={{ textAlign: 'center' }}>
                <td>{report.id}</td>
                <td>{report.user_name}</td>
                <td><img src={report.image_data} width="60" alt="하자" /></td>
                <td style={{ fontSize: '12px', textAlign: 'left', padding: '5px' }}>
                    {report.analysis_result.substring(0, 50)}...
                </td>
                <td style={{ fontWeight: 'bold', color: report.status === '처리 완료' ? 'green' : 'orange' }}>
                    {report.status}
                </td>
                <td>
                  <button onClick={() => updateStatus(report.id, '보수중')}>보수중</button>
                  <button onClick={() => updateStatus(report.id, '처리 완료')}>완료</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // [3] 로그인 후: 일반 사용자용 화면 (기존 챗봇)
  return (
   <div style={{ padding: '20px', maxWidth: '800px', margin: 'auto', fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ddd', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          {/* 로고 추가 */}
          <img src="/logo.png" alt="Logo" style={{ height: '80px' }} />
          <h2 style={{ margin: 0 }}>👷‍♂️ {user.name}님의 건설하자 진단 챗봇</h2>
        </div>
        <button onClick={handleLogout}>로그아웃</button>
      </header>
      {/* 챗봇 대화 영역 */}
      <div style={{ height: '400px', overflowY: 'auto', border: '1px solid #eee', padding: '10px', marginBottom: '20px', borderRadius: '10px' }}>
        {messages.map((msg, index) => (
          <div key={index} style={{ textAlign: msg.role === 'user' ? 'right' : 'left', margin: '10px 0' }}>
            <div style={{ 
              display: 'inline-block', padding: '10px', borderRadius: '10px', 
              backgroundColor: msg.role === 'user' ? '#007bff' : '#f1f1f1',
              color: msg.role === 'user' ? '#fff' : '#000',
              maxWidth: '80%', whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
              {msg.role === 'assistant' && (
                <button 
                  onClick={() => saveToDB(msg.content)}
                  style={{ display: 'block', marginTop: '10px', fontSize: '12px', cursor: 'pointer' }}
                >
                  📥 민원 접수
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && <p>AI가 분석 중입니다...</p>}
      </div>

      {/* 입력 영역 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input type="file" onChange={handleImageUpload} accept="image/*" />
          {preview && <img src={preview} alt="preview" style={{ width: '50px', height: '50px', objectFit: 'cover', borderRadius: '5px' }} />}
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          <input 
            style={{ flex: 1, padding: '10px' }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="질문을 입력하세요..."
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage} disabled={loading} style={{ padding: '0 20px' }}>전송</button>
        </div>
      </div>

      {/* 하단: 나의 접수 내역 리스트 */}
      <div style={{ borderTop: '2px solid #333', paddingTop: '20px' }}>
        <h3>📋 나의 하자 접수 내역 ({reports.length}건)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px', marginTop: '15px' }}>
          {reports.length === 0 ? (
            <p style={{ color: '#888' }}>아직 접수된 내역이 없습니다.</p>
          ) : (
            reports.map((report) => (
              <div key={report.id} style={{ display: 'flex', gap: '15px', padding: '15px', border: '1px solid #ddd', borderRadius: '10px', backgroundColor: '#f9f9f9' }}>
                <img src={report.image_data} alt="하자" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '5px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#666' }}>
                    <span>접수 번호: #{report.id}</span>
                    <span>{new Date(report.created_at).toLocaleString()}</span>
                  </div>
                  <div style={{ fontWeight: 'bold', margin: '5px 0', color: report.status === '처리 완료' ? '#27ae60' : '#f39c12' }}>
                    상태: {report.status}
                  </div>
                  <div style={{ fontSize: '13px', color: '#333', whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {report.analysis_result}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default ConstructionChatbot;