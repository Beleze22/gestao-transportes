import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Tela de login, desenhada a partir de docs/design/prototipo/Login.dc.html: fundo
// verde-escuro, a marca em cima e um cartão branco de 400 px com os dois campos.
//
// Não existe link de "criar conta" de propósito. O cadastro público fica desligado no
// painel do Supabase — com ele ligado, qualquer pessoa criaria um usuário pela API com a
// chave do bundle, viraria `authenticated` e teria acesso a tudo. A redefinição de senha
// também é feita pelo painel, e é o que a última linha do cartão explica.
export default function Login({ onEntrar }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const mensagem = await onEntrar(email, senha);
      // Em caso de sucesso quem troca a tela é o portão, ao receber a sessão nova; aqui
      // não há o que fazer além de deixar o botão voltar ao normal se deu errado.
      if (mensagem) {
        setErro(mensagem);
        setEnviando(false);
      }
    } catch (err) {
      setErro(err?.message ?? "Não foi possível entrar. Tente de novo.");
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-green flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm flex flex-col items-center gap-7">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/rohan-brasao-transparente.png"
            alt="Rohan Transportes"
            className="h-22 w-22 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <p className="text-brand-gold font-bold text-xl tracking-widest uppercase leading-tight text-center">
            Rohan Transportes
          </p>
          <p className="text-brand-gold/60 text-xs tracking-[0.28em] uppercase">
            Sistema de Gestão
          </p>
        </div>

        <Card className="w-full p-7">
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <h1 className="text-lg font-bold text-brand-green">Entrar</h1>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-email">E-mail</Label>
              <Input
                id="login-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="login-senha">Senha</Label>
              <Input
                id="login-senha"
                type="password"
                autoComplete="current-password"
                required
                className="h-11"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </div>

            {erro && (
              <p
                role="alert"
                className="rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
                {erro}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full" disabled={enviando}>
              {enviando ? "Entrando..." : "Entrar"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Esqueceu a senha? Peça a redefinição ao administrador.
            </p>
          </form>
        </Card>
      </div>
    </div>
  );
}
