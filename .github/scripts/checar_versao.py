"""
Protecao contra downgrade de versao (31/07/2026, mesmo padrao do
ChequeSys/TesourariaSys).

Roda em toda push que altere CartoesPF.html ou CartoesPJ.html. Compara a
versao (const VERSAO = 'vX.Y[.Z]') de CADA arquivo passado, no commit atual
contra o commit anterior. Se QUALQUER UM dos arquivos regredir, marca
downgrade=true -> o workflow reverte o commit inteiro automaticamente.

Uso: python3 checar_versao.py <arquivo1> [arquivo2 ...]
"""
import re, subprocess, sys, os

def extrair_versao(texto):
    if texto is None:
        return None
    m = re.search(r"const VERSAO\s*=\s*'([^']+)'", texto)
    if not m:
        return None
    partes = m.group(1).lstrip('vV').split('.')
    try:
        return tuple(int(p) for p in partes)
    except ValueError:
        return None

def ler_arquivo_em_commit(commit, caminho):
    r = subprocess.run(['git', 'show', f'{commit}:{caminho}'],
                        capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None

def main():
    if len(sys.argv) < 2:
        print("Uso: checar_versao.py <arquivo1> [arquivo2 ...]")
        sys.exit(2)
    arquivos = sys.argv[1:]

    downgrade = False
    for arquivo in arquivos:
        atual = ler_arquivo_em_commit('HEAD', arquivo)
        anterior = ler_arquivo_em_commit('HEAD~1', arquivo)

        v_atual = extrair_versao(atual)
        v_anterior = extrair_versao(anterior)

        if v_atual is None:
            print(f"AVISO: nao encontrei VERSAO em {arquivo} no commit atual - pulando checagem")
        elif v_anterior is None:
            print(f"AVISO: nao encontrei VERSAO em {arquivo} no commit anterior - pulando checagem (provavelmente primeiro commit com essa constante)")
        elif v_atual < v_anterior:
            print(f"::error::REGRESSAO DE VERSAO DETECTADA em {arquivo}: {'.'.join(map(str,v_anterior))} -> {'.'.join(map(str,v_atual))}")
            downgrade = True
        else:
            print(f"OK: {arquivo} versao anterior={v_anterior} atual={v_atual} (sem regressao)")

    gh_output = os.environ.get('GITHUB_OUTPUT')
    if gh_output:
        with open(gh_output, 'a') as f:
            f.write(f"downgrade={'true' if downgrade else 'false'}\n")

    sys.exit(1 if downgrade else 0)

if __name__ == '__main__':
    main()
