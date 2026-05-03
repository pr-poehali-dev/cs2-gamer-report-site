import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";

const STEAM_AUTH_URL = "https://functions.poehali.dev/7a21934d-53eb-4ae2-ad48-e4f3191dd4fe";

type SteamUser = {
  steam_id: string;
  username: string;
  avatar_url: string;
  profile_url: string;
} | null;

function useSteamAuth() {
  const [user, setUser] = useState<SteamUser>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`${STEAM_AUTH_URL}?action=me`, {
        headers: { "X-Session-Id": sid },
      });
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionFromUrl = params.get("session");
    if (sessionFromUrl) {
      localStorage.setItem("cs2_session", sessionFromUrl);
      params.delete("session");
      const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
      window.history.replaceState({}, "", newUrl);
      fetchMe(sessionFromUrl);
    } else {
      const stored = localStorage.getItem("cs2_session");
      if (stored) fetchMe(stored);
      else setLoading(false);
    }
  }, [fetchMe]);

  const login = () => {
    window.location.href = `${STEAM_AUTH_URL}?action=login`;
  };

  const logout = async () => {
    const sid = localStorage.getItem("cs2_session");
    if (sid) {
      await fetch(`${STEAM_AUTH_URL}?action=logout`, {
        method: "POST",
        headers: { "X-Session-Id": sid },
      }).catch(() => {});
      localStorage.removeItem("cs2_session");
    }
    setUser(null);
  };

  return { user, loading, login, logout };
}

const HERO_IMG = "https://cdn.poehali.dev/projects/f5a08a12-bc9f-4d49-b5a3-16f2cece57ca/files/9e7f6556-44a1-4f43-a240-cda852b49bb2.jpg";

const NAV_LINKS = [
  { id: "home",     label: "Главная" },
  { id: "report",  label: "Подать жалобу" },
  { id: "status",  label: "Статус" },
  { id: "ranking", label: "Рейтинг" },
  { id: "stats",   label: "Статистика" },
  { id: "faq",     label: "FAQ" },
  { id: "contact", label: "Контакты" },
];

const TOP_CHEATERS = [
  { rank: 1,  nick: "xX_AIMB0T_Xx",     steam: "STEAM_0:1:12345678", reports: 847, status: "ЗАБЛОКИРОВАН", type: "Aimbот" },
  { rank: 2,  nick: "WallhackKing",       steam: "STEAM_0:0:87654321", reports: 634, status: "НА ПРОВЕРКЕ",  type: "Wallhack" },
  { rank: 3,  nick: "SpeedH4cker",        steam: "STEAM_0:1:55512345", reports: 589, status: "ЗАБЛОКИРОВАН", type: "Speedhack" },
  { rank: 4,  nick: "tr1gger_b0t",        steam: "STEAM_0:0:99988877", reports: 421, status: "АКТИВЕН",      type: "Triggerbot" },
  { rank: 5,  nick: "NoRecoilMaster",     steam: "STEAM_0:1:11122233", reports: 398, status: "НА ПРОВЕРКЕ",  type: "No-recoil" },
];

const FAQS = [
  {
    q: "Как подать жалобу на читера?",
    a: "Авторизуйтесь через Steam, заполните форму жалобы, укажите Steam ID нарушителя и выберите тип нарушения. Загрузите доказательства: демо, скриншоты или видео.",
  },
  {
    q: "Сколько времени занимает проверка?",
    a: "Среднее время проверки — 48–72 часа. Жалобы с видеодоказательствами обрабатываются приоритетно.",
  },
  {
    q: "Нужна ли верификация Steam?",
    a: "Да. Steam-верификация обязательна для защиты от ложных жалоб. Ваш аккаунт должен быть не моложе 30 дней.",
  },
  {
    q: "Что происходит после подтверждения читерства?",
    a: "Информация передаётся в Valve Anti-Cheat. Профиль нарушителя добавляется в публичный рейтинг с пометкой ЗАБЛОКИРОВАН.",
  },
  {
    q: "Могу ли я отозвать жалобу?",
    a: "Жалобу можно отозвать в течение 24 часов после подачи через раздел 'Статус проверки'.",
  },
];

const STATUS_STAGES = [
  { label: "Принята",    desc: "Жалоба зарегистрирована в системе" },
  { label: "Анализ",     desc: "Автоматическая проверка данных" },
  { label: "Модерация",  desc: "Ручная проверка модератором" },
  { label: "Заключение", desc: "Вынесение решения" },
];

export default function Index() {
  const { user, loading, login, logout } = useSteamAuth();
  const [activeNav, setActiveNav] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportForm, setReportForm] = useState({ profileUrl: "", type: "", desc: "", proof: "" });
  const [targetProfile, setTargetProfile] = useState<{ steam_id: string; username: string; avatar_url: string; profile_url: string } | null>(null);
  const [resolveState, setResolveState] = useState<"idle" | "loading" | "error">("idle");
  const [resolveError, setResolveError] = useState("");
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState("");
  const [statusId, setStatusId] = useState("");
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const REPORT_URL = "https://functions.poehali.dev/32f5b69d-00df-4836-a6b7-f303418be40d";

  const resolveProfile = useCallback(async (url: string) => {
    if (!url.trim()) { setTargetProfile(null); setResolveState("idle"); return; }
    setResolveState("loading");
    setTargetProfile(null);
    setResolveError("");
    try {
      const res = await fetch(`${REPORT_URL}?action=resolve&url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (!res.ok) { setResolveError(data.error || "Ошибка"); setResolveState("error"); return; }
      setTargetProfile(data);
      setResolveState("idle");
    } catch {
      setResolveError("Не удалось связаться с сервером");
      setResolveState("error");
    }
  }, []);

  // Debounce resolve
  useEffect(() => {
    const t = setTimeout(() => resolveProfile(reportForm.profileUrl), 700);
    return () => clearTimeout(t);
  }, [reportForm.profileUrl, resolveProfile]);

  const submitReport = async () => {
    if (!user || !targetProfile || !reportForm.type) return;
    setSubmitState("loading");
    setSubmitError("");
    try {
      const sid = localStorage.getItem("cs2_session") || "";
      const res = await fetch(`${REPORT_URL}?action=submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Id": sid },
        body: JSON.stringify({
          target_steam_id: targetProfile.steam_id,
          target_username: targetProfile.username,
          target_avatar_url: targetProfile.avatar_url,
          target_profile_url: targetProfile.profile_url,
          violation_type: reportForm.type,
          description: reportForm.desc,
          proof_url: reportForm.proof,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError(data.error || "Ошибка"); setSubmitState("error"); return; }
      setSubmitState("success");
      setReportForm({ profileUrl: "", type: "", desc: "", proof: "" });
      setTargetProfile(null);
    } catch {
      setSubmitError("Не удалось отправить жалобу");
      setSubmitState("error");
    }
  };

  const scrollTo = (id: string) => {
    setActiveNav(id);
    setMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-cs-dark text-[var(--text-primary)] font-ibm">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[rgba(10,10,10,0.95)] backdrop-blur-sm border-b border-[var(--border-subtle)]">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => scrollTo("home")} className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[var(--red)] flex items-center justify-center">
              <Icon name="Crosshair" size={16} className="text-white" />
            </div>
            <span className="font-oswald font-bold text-lg tracking-widest text-white">
              CS2<span className="text-[var(--red)]">REPORT</span>
            </span>
          </button>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((n) => (
              <button
                key={n.id}
                onClick={() => scrollTo(n.id)}
                className={`px-3 py-1.5 text-xs font-ibm font-medium tracking-wide uppercase transition-all
                  ${activeNav === n.id
                    ? "text-[var(--red)] border-b border-[var(--red)]"
                    : "text-[var(--text-muted)] hover:text-white"
                  }`}
              >
                {n.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="hidden lg:block w-8 h-8 border border-[var(--border-subtle)] border-t-[var(--red)] rounded-full animate-spin" />
          ) : user ? (
            <div className="hidden lg:flex items-center gap-2">
              <img src={user.avatar_url} alt={user.username} className="w-7 h-7 object-cover border border-[rgba(224,48,48,0.4)]" />
              <span className="text-xs text-white font-oswald font-semibold">{user.username}</span>
              <button onClick={logout} className="text-[var(--text-muted)] hover:text-[var(--red)] transition-colors ml-1">
                <Icon name="LogOut" size={14} />
              </button>
            </div>
          ) : (
            <button onClick={login} className="btn-red hidden lg:flex items-center gap-2 px-4 py-2 text-xs">
              <Icon name="LogIn" size={14} />
              Войти через Steam
            </button>
          )}

          <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden text-[var(--text-muted)] hover:text-white">
            <Icon name={menuOpen ? "X" : "Menu"} size={22} />
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden bg-[#0d0d0d] border-t border-[var(--border-subtle)] animate-slide-down">
            {NAV_LINKS.map((n) => (
              <button
                key={n.id}
                onClick={() => scrollTo(n.id)}
                className="block w-full text-left px-5 py-3 text-sm font-ibm text-[var(--text-muted)] hover:text-white hover:bg-[rgba(224,48,48,0.07)] border-b border-[var(--border-subtle)] uppercase tracking-wide"
              >
                {n.label}
              </button>
            ))}
            <div className="p-4">
              {user ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img src={user.avatar_url} alt={user.username} className="w-8 h-8 border border-[rgba(224,48,48,0.4)]" />
                    <span className="text-sm font-oswald font-semibold text-white">{user.username}</span>
                  </div>
                  <button onClick={logout} className="text-xs text-[var(--text-muted)] hover:text-[var(--red)] flex items-center gap-1">
                    <Icon name="LogOut" size={13} /> Выйти
                  </button>
                </div>
              ) : (
                <button onClick={login} className="btn-red w-full py-2.5 text-sm flex items-center justify-center gap-2">
                  <Icon name="LogIn" size={15} />
                  Войти через Steam
                </button>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="home" className="relative min-h-screen flex items-center overflow-hidden pt-14">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="CS2" className="w-full h-full object-cover opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-r from-cs-dark via-[rgba(10,10,10,0.85)] to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-cs-dark via-transparent to-transparent" />
        </div>
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-transparent via-[var(--red)] to-transparent opacity-70" />

        <div className="relative max-w-7xl mx-auto px-4 py-20 lg:py-32">
          <div className="max-w-2xl">
            <div className="tag-red inline-block mb-6 animate-fade-in">
              ◆ ПЛАТФОРМА ВЕРИФИКАЦИИ CS2
            </div>
            <h1 className="font-oswald text-5xl md:text-7xl lg:text-8xl font-bold leading-none mb-6 animate-fade-in delay-100">
              ЧИСТАЯ<br />
              <span className="text-[var(--red)] glow-red">ИГРА</span><br />
              НАЧИНАЕТСЯ<br />
              ЗДЕСЬ
            </h1>
            <p className="text-[var(--text-muted)] text-base md:text-lg mb-10 leading-relaxed max-w-lg animate-fade-in delay-200">
              Сообщай о читерах через Steam-верификацию. Каждая жалоба отслеживается,
              каждый нарушитель получает свой рейтинг.
            </p>
            <div className="flex flex-wrap gap-3 animate-fade-in delay-300">
              <button onClick={() => scrollTo("report")} className="btn-red px-8 py-3 text-sm flex items-center gap-2">
                <Icon name="AlertTriangle" size={16} />
                Подать жалобу
              </button>
              <button onClick={() => scrollTo("status")} className="px-8 py-3 text-sm font-oswald font-semibold uppercase tracking-widest border border-[rgba(255,255,255,0.15)] text-white hover:border-[var(--red)] hover:text-[var(--red)] transition-all flex items-center gap-2">
                <Icon name="Search" size={16} />
                Проверить статус
              </button>
            </div>
            <div className="mt-16 grid grid-cols-3 gap-6 max-w-sm animate-fade-in delay-400">
              {[
                { val: "12,847", label: "Жалоб подано" },
                { val: "3,291",  label: "Заблокировано" },
                { val: "98.2%",  label: "Точность" },
              ].map((s) => (
                <div key={s.label}>
                  <div className="font-oswald text-2xl font-bold text-[var(--red)]">{s.val}</div>
                  <div className="text-[var(--text-muted)] text-xs mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SUBMIT REPORT */}
      <section id="report" className="py-20 border-t border-[var(--border-subtle)]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="tag-red inline-block mb-4">СИСТЕМА ЖАЛОБ</div>
            <h2 className="font-oswald text-4xl md:text-5xl font-bold mb-4">
              ПОДАТЬ <span className="text-[var(--red)]">ЖАЛОБУ</span>
            </h2>
            <div className="section-line mt-4" />
          </div>

          <div className="bg-cs-card border border-[var(--border-subtle)] p-6 md:p-8">
            {user ? (
              <div className="flex items-center gap-4 p-4 mb-6 border border-[rgba(48,200,48,0.3)] bg-[rgba(48,200,48,0.05)]">
                <img src={user.avatar_url} alt={user.username} className="w-10 h-10 border border-[rgba(48,200,48,0.4)] shrink-0" />
                <div>
                  <div className="font-oswald font-semibold text-sm tracking-wide text-white">
                    АВТОРИЗОВАН КАК {user.username.toUpperCase()}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">{user.steam_id}</div>
                </div>
                <button onClick={logout} className="ml-auto text-xs text-[var(--text-muted)] hover:text-[var(--red)] flex items-center gap-1 transition-colors shrink-0">
                  <Icon name="LogOut" size={13} /> Выйти
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 mb-6 border border-[rgba(224,48,48,0.3)] bg-[rgba(224,48,48,0.05)]">
                <Icon name="ShieldCheck" size={24} className="text-[var(--red)] shrink-0" />
                <div>
                  <div className="font-oswald font-semibold text-sm tracking-wide text-white">
                    ТРЕБУЕТСЯ STEAM-ВЕРИФИКАЦИЯ
                  </div>
                  <div className="text-xs text-[var(--text-muted)] mt-0.5">
                    Войдите через Steam чтобы подтвердить личность перед отправкой жалобы
                  </div>
                </div>
                <button onClick={login} className="btn-red ml-auto px-4 py-2 text-xs shrink-0">Войти</button>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-oswald font-semibold tracking-widest text-[var(--text-muted)] uppercase mb-2">
                  Ссылка на профиль нарушителя
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="https://steamcommunity.com/id/username или /profiles/76561198..."
                    value={reportForm.profileUrl}
                    onChange={(e) => setReportForm({ ...reportForm, profileUrl: e.target.value })}
                    className={`w-full bg-[var(--bg-dark)] border text-white px-4 py-3 text-sm focus:outline-none transition-colors pr-10
                      ${resolveState === "error" ? "border-[var(--red)]" : targetProfile ? "border-green-600" : "border-[var(--border-subtle)] focus:border-[var(--red)]"}`}
                  />
                  {resolveState === "loading" && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border border-[var(--border-subtle)] border-t-[var(--red)] rounded-full animate-spin" />
                  )}
                  {targetProfile && resolveState !== "loading" && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">✓</div>
                  )}
                </div>
                {resolveState === "error" && (
                  <div className="text-xs text-[var(--red)] mt-1">{resolveError}</div>
                )}
                {targetProfile && (
                  <div className="flex items-center gap-3 mt-2 p-3 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)]">
                    <img src={targetProfile.avatar_url} alt={targetProfile.username} className="w-10 h-10 shrink-0" />
                    <div>
                      <div className="text-sm font-oswald font-semibold text-white">{targetProfile.username}</div>
                      <div className="text-xs font-mono text-[var(--text-muted)]">{targetProfile.steam_id}</div>
                    </div>
                    <a href={targetProfile.profile_url} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-[var(--text-muted)] hover:text-white transition-colors">
                      <Icon name="ExternalLink" size={13} />
                    </a>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-oswald font-semibold tracking-widest text-[var(--text-muted)] uppercase mb-2">
                  Тип нарушения
                </label>
                <select
                  value={reportForm.type}
                  onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}
                  className="w-full bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white px-4 py-3 text-sm focus:outline-none focus:border-[var(--red)] transition-colors appearance-none"
                >
                  <option value="">— Выберите тип —</option>
                  <option>Aimbот</option>
                  <option>Wallhack</option>
                  <option>Triggerbot</option>
                  <option>Speedhack</option>
                  <option>No-recoil</option>
                  <option>Bhop-скрипт</option>
                  <option>Радар-хак</option>
                  <option>Другое</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-oswald font-semibold tracking-widest text-[var(--text-muted)] uppercase mb-2">
                  Ссылка на доказательства
                </label>
                <input
                  type="text"
                  placeholder="YouTube / Imgur / HLAE демо"
                  value={reportForm.proof}
                  onChange={(e) => setReportForm({ ...reportForm, proof: e.target.value })}
                  className="w-full bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white px-4 py-3 text-sm focus:outline-none focus:border-[var(--red)] transition-colors"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-oswald font-semibold tracking-widest text-[var(--text-muted)] uppercase mb-2">
                  Описание нарушения
                </label>
                <textarea
                  rows={4}
                  placeholder="Опишите ситуацию подробно: карта, раунд, что именно происходило..."
                  value={reportForm.desc}
                  onChange={(e) => setReportForm({ ...reportForm, desc: e.target.value })}
                  className="w-full bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white px-4 py-3 text-sm focus:outline-none focus:border-[var(--red)] transition-colors resize-none"
                />
              </div>
            </div>

            {submitState === "success" && (
              <div className="mt-5 flex items-center gap-3 p-4 border border-green-700 bg-[rgba(48,200,48,0.07)] text-green-400 text-sm font-oswald tracking-wide animate-fade-in">
                <Icon name="CheckCircle" size={18} />
                ЖАЛОБА №{Math.floor(Math.random() * 9000 + 1000)} ПРИНЯТА. Рассмотрение займёт до 72 часов.
              </div>
            )}
            {submitState === "error" && (
              <div className="mt-5 flex items-center gap-3 p-4 border border-[rgba(224,48,48,0.4)] bg-[rgba(224,48,48,0.05)] text-[var(--red)] text-sm">
                <Icon name="AlertCircle" size={16} />
                {submitError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
              <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                <Icon name="Lock" size={13} />
                Данные защищены. Анонимная отправка невозможна.
              </div>
              {user ? (
                <button
                  onClick={submitReport}
                  disabled={!targetProfile || !reportForm.type || submitState === "loading"}
                  className="btn-red px-8 py-3 text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {submitState === "loading" ? (
                    <><div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin" /> Отправка...</>
                  ) : (
                    <><Icon name="Send" size={15} /> Отправить жалобу</>
                  )}
                </button>
              ) : (
                <button onClick={login} className="btn-red px-8 py-3 text-sm flex items-center gap-2 opacity-80">
                  <Icon name="LogIn" size={15} />
                  Войдите чтобы отправить
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* STATUS CHECK */}
      <section id="status" className="py-20 bg-[rgba(255,255,255,0.015)] border-t border-[var(--border-subtle)]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="tag-red inline-block mb-4">ОТСЛЕЖИВАНИЕ</div>
            <h2 className="font-oswald text-4xl md:text-5xl font-bold mb-4">
              СТАТУС <span className="text-[var(--red)]">ПРОВЕРКИ</span>
            </h2>
            <div className="section-line mt-4" />
          </div>

          <div className="bg-cs-card border border-[var(--border-subtle)] p-6 mb-6">
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Введите ID жалобы (например: RPT-2024-00847)"
                value={statusId}
                onChange={(e) => setStatusId(e.target.value)}
                className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white px-4 py-3 text-sm font-mono focus:outline-none focus:border-[var(--red)] transition-colors"
              />
              <button className="btn-red px-6 py-3 text-sm flex items-center gap-2">
                <Icon name="Search" size={15} />
                Найти
              </button>
            </div>
          </div>

          <div className="bg-cs-card border border-[var(--border-subtle)] p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div>
                <div className="font-mono text-xs text-[var(--text-muted)]">ЖАЛОБА</div>
                <div className="font-oswald font-bold text-xl text-white">RPT-2024-00847</div>
              </div>
              <div className="tag-red">НА ПРОВЕРКЕ</div>
            </div>

            <div className="relative mb-6">
              <div className="absolute top-4 left-4 right-4 h-0.5 bg-[var(--border-subtle)]">
                <div className="h-full bg-[var(--red)] w-1/2" />
              </div>
              <div className="grid grid-cols-4 gap-2 relative">
                {STATUS_STAGES.map((s, i) => (
                  <div key={i} className="flex flex-col items-center text-center">
                    <div className={`w-8 h-8 flex items-center justify-center mb-3 z-10 relative
                      ${i < 2 ? "bg-[var(--red)]" : "bg-[var(--bg-dark)] border border-[var(--border-subtle)]"}`}>
                      {i < 2
                        ? <Icon name="Check" size={14} className="text-white" />
                        : <span className="text-[var(--text-muted)] text-xs font-mono">{i + 1}</span>
                      }
                    </div>
                    <div className={`text-xs font-oswald font-semibold uppercase mb-1
                      ${i < 2 ? "text-white" : "text-[var(--text-muted)]"}`}>
                      {s.label}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] leading-tight hidden md:block">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-5 border-t border-[var(--border-subtle)] grid md:grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">Нарушитель</div>
                <div className="font-mono text-white">WallhackKing</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">Тип</div>
                <div className="text-white">Wallhack</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-muted)] mb-1">Дата подачи</div>
                <div className="font-mono text-white">2024-11-28</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CHEATER RANKING */}
      <section id="ranking" className="py-20 border-t border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="tag-red inline-block mb-4">ПУБЛИЧНЫЙ РЕЕСТР</div>
            <h2 className="font-oswald text-4xl md:text-5xl font-bold mb-4">
              РЕЙТИНГ <span className="text-[var(--red)]">ЧИТЕРОВ</span>
            </h2>
            <div className="section-line mt-4" />
            <p className="text-[var(--text-muted)] text-sm mt-4 max-w-md mx-auto">
              Топ нарушителей по количеству подтверждённых жалоб
            </p>
          </div>

          <div className="space-y-2">
            {TOP_CHEATERS.map((c) => (
              <div key={c.rank} className="card-hover bg-cs-card flex items-center gap-4 px-5 py-4">
                <div className={`w-8 text-center font-oswald font-bold text-xl shrink-0
                  ${c.rank === 1 ? "text-[var(--red)]" : c.rank === 2 ? "text-gray-400" : c.rank === 3 ? "text-amber-700" : "text-[var(--text-muted)]"}`}>
                  {c.rank}
                </div>
                <div className="w-9 h-9 bg-[var(--bg-dark)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                  <Icon name="User" size={16} className="text-[var(--text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-oswald font-semibold text-white">{c.nick}</div>
                  <div className="font-mono text-xs text-[var(--text-muted)] truncate">{c.steam}</div>
                </div>
                <div className="hidden md:block text-xs text-[var(--text-muted)] w-28 shrink-0">{c.type}</div>
                <div className="text-right shrink-0">
                  <div className="font-oswald font-bold text-lg text-white">{c.reports}</div>
                  <div className="text-xs text-[var(--text-muted)]">жалоб</div>
                </div>
                <div className={`shrink-0 font-oswald text-xs font-semibold px-3 py-1 border tracking-wide
                  ${c.status === "ЗАБЛОКИРОВАН"
                    ? "border-[var(--red)] text-[var(--red)] bg-[rgba(224,48,48,0.08)]"
                    : c.status === "НА ПРОВЕРКЕ"
                    ? "border-yellow-600 text-yellow-500 bg-[rgba(234,179,8,0.08)]"
                    : "border-gray-600 text-gray-400 bg-[rgba(255,255,255,0.04)]"
                  }`}>
                  {c.status}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center">
            <button className="px-6 py-2.5 text-sm font-oswald font-semibold uppercase tracking-widest border border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--red)] hover:text-[var(--red)] transition-all">
              Загрузить ещё
            </button>
          </div>
        </div>
      </section>

      {/* STATISTICS */}
      <section id="stats" className="py-20 bg-[rgba(255,255,255,0.015)] border-t border-[var(--border-subtle)]">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="tag-red inline-block mb-4">ДАННЫЕ ПЛАТФОРМЫ</div>
            <h2 className="font-oswald text-4xl md:text-5xl font-bold mb-4">
              <span className="text-[var(--red)]">СТАТИСТИКА</span>
            </h2>
            <div className="section-line mt-4" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            {[
              { icon: "FileWarning", val: "12,847", label: "Жалоб принято",           sub: "+142 сегодня" },
              { icon: "ShieldOff",  val: "3,291",   label: "Аккаунтов заблокировано", sub: "+28 за неделю" },
              { icon: "Users",      val: "4,580",   label: "Верифицированных игроков", sub: "Steam-аккаунты" },
              { icon: "Clock",      val: "41ч",     label: "Среднее время проверки",   sub: "По всем жалобам" },
            ].map((s) => (
              <div key={s.label} className="card-hover bg-cs-card p-5 text-center">
                <div className="w-10 h-10 bg-[rgba(224,48,48,0.1)] border border-[rgba(224,48,48,0.2)] flex items-center justify-center mx-auto mb-3">
                  <Icon name={s.icon} fallback="CircleAlert" size={18} className="text-[var(--red)]" />
                </div>
                <div className="font-oswald font-bold text-3xl text-white mb-1">{s.val}</div>
                <div className="text-xs text-[var(--text-muted)] leading-tight mb-2">{s.label}</div>
                <div className="text-xs text-[rgba(224,48,48,0.7)] font-mono">{s.sub}</div>
              </div>
            ))}
          </div>

          <div className="bg-cs-card border border-[var(--border-subtle)] p-6">
            <div className="font-oswald font-bold text-lg mb-5 text-white">
              РАСПРЕДЕЛЕНИЕ ПО ТИПАМ НАРУШЕНИЙ
            </div>
            {[
              { type: "Aimbот",     pct: 38, count: 4882 },
              { type: "Wallhack",   pct: 27, count: 3469 },
              { type: "Triggerbot", pct: 16, count: 2055 },
              { type: "Speedhack",  pct: 11, count: 1413 },
              { type: "Другое",     pct: 8,  count: 1028 },
            ].map((t) => (
              <div key={t.type} className="mb-4 last:mb-0">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="font-oswald font-medium text-white">{t.type}</span>
                  <span className="font-mono text-[var(--text-muted)]">{t.count.toLocaleString()} / {t.pct}%</span>
                </div>
                <div className="h-1.5 bg-[var(--bg-dark)]">
                  <div className="h-full bg-[var(--red)]" style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 border-t border-[var(--border-subtle)]">
        <div className="max-w-3xl mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="tag-red inline-block mb-4">ВОПРОСЫ И ОТВЕТЫ</div>
            <h2 className="font-oswald text-4xl md:text-5xl font-bold mb-4">FAQ</h2>
            <div className="section-line mt-4" />
          </div>

          <div className="space-y-2">
            {FAQS.map((f, i) => (
              <div key={i} className="bg-cs-card border border-[var(--border-subtle)] hover:border-[rgba(224,48,48,0.2)] transition-colors">
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
                >
                  <span className="font-oswald font-semibold text-white text-sm md:text-base tracking-wide">
                    {f.q}
                  </span>
                  <Icon
                    name={faqOpen === i ? "Minus" : "Plus"}
                    size={16}
                    className={`shrink-0 transition-colors ${faqOpen === i ? "text-[var(--red)]" : "text-[var(--text-muted)]"}`}
                  />
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-5 border-t border-[var(--border-subtle)] pt-4 animate-slide-down">
                    <p className="text-[var(--text-muted)] text-sm leading-relaxed">{f.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACTS */}
      <section id="contact" className="py-20 bg-[rgba(255,255,255,0.015)] border-t border-[var(--border-subtle)]">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-12 text-center">
            <div className="tag-red inline-block mb-4">СВЯЗЬ</div>
            <h2 className="font-oswald text-4xl md:text-5xl font-bold mb-4">
              <span className="text-[var(--red)]">КОНТАКТЫ</span>
            </h2>
            <div className="section-line mt-4" />
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-10">
            {[
              { icon: "Mail",          title: "Email",    val: "report@cs2report.gg",    sub: "Ответ в течение 24ч" },
              { icon: "MessageSquare", title: "Discord",  val: "discord.gg/cs2report",   sub: "Онлайн 24/7" },
              { icon: "Send",          title: "Telegram", val: "@cs2report",              sub: "Быстрый ответ" },
            ].map((c) => (
              <div key={c.title} className="card-hover bg-cs-card p-6 text-center">
                <div className="w-12 h-12 bg-[rgba(224,48,48,0.1)] border border-[rgba(224,48,48,0.25)] flex items-center justify-center mx-auto mb-4">
                  <Icon name={c.icon} fallback="CircleAlert" size={20} className="text-[var(--red)]" />
                </div>
                <div className="font-oswald font-bold text-sm text-[var(--text-muted)] uppercase tracking-widest mb-1">{c.title}</div>
                <div className="font-mono text-white text-sm mb-1">{c.val}</div>
                <div className="text-xs text-[var(--text-muted)]">{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="bg-cs-card border border-[var(--border-subtle)] p-6 md:p-8">
            <div className="font-oswald font-bold text-lg mb-5 text-white">НАПИСАТЬ НАМ</div>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <input
                type="text"
                placeholder="Ваше имя"
                className="bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white px-4 py-3 text-sm focus:outline-none focus:border-[var(--red)] transition-colors"
              />
              <input
                type="email"
                placeholder="Email"
                className="bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white px-4 py-3 text-sm focus:outline-none focus:border-[var(--red)] transition-colors"
              />
            </div>
            <textarea
              rows={4}
              placeholder="Ваше сообщение..."
              className="w-full bg-[var(--bg-dark)] border border-[var(--border-subtle)] text-white px-4 py-3 text-sm focus:outline-none focus:border-[var(--red)] transition-colors resize-none mb-4"
            />
            <div className="flex justify-end">
              <button className="btn-red px-8 py-3 text-sm flex items-center gap-2">
                <Icon name="Send" size={15} />
                Отправить
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[var(--border-subtle)] py-8">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-[var(--red)] flex items-center justify-center">
              <Icon name="Crosshair" size={12} className="text-white" />
            </div>
            <span className="font-oswald font-bold tracking-widest text-sm text-white">
              CS2<span className="text-[var(--red)]">REPORT</span>
            </span>
          </div>
          <div className="text-xs text-[var(--text-muted)] text-center">
            Независимая платформа. Не аффилирована с Valve Corporation.
          </div>
          <div className="flex gap-4 text-xs text-[var(--text-muted)]">
            <button className="hover:text-white transition-colors">Политика конфиденциальности</button>
            <button className="hover:text-white transition-colors">Правила использования</button>
          </div>
        </div>
      </footer>

    </div>
  );
}