// Парольный гейт интерфейса. Если сервер требует пароль и сессии нет —
// показывает форму входа; иначе пропускает к приложению.
import { useEffect, useState, type ReactNode, type SubmitEvent } from "react";
import { fetchAuthStatus, login } from "../api/client.js";

type Gate = "loading" | "open" | "locked";

export function AuthGate({ children }: { children: ReactNode }) {
    const [gate, setGate] = useState<Gate>("loading");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        fetchAuthStatus()
            .then((s) => setGate(!s.required || s.authenticated ? "open" : "locked"))
            .catch(() => setGate("open")); // статус недоступен — не блокируем
    }, []);

    if (gate === "loading") return <div className="auth-screen">Загрузка…</div>;
    if (gate === "open") return <>{children}</>;

    const submit = async (e: SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
            const ok = await login(password);
            if (ok) setGate("open");
            else setError("Неверный пароль");
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="auth-screen">
            <form className="auth-form" onSubmit={submit}>
                <h1>Матрица доступа PERCo</h1>
                <p>Введите пароль для доступа</p>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    autoComplete="current-password"
                />
                {error && <div className="auth-error">{error}</div>}
                <button type="submit" disabled={busy}>
                    {busy ? "Проверка…" : "Войти"}
                </button>
            </form>
        </div>
    );
}
