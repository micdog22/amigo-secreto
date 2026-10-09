# Amigo Secreto: sorteio com restrições e um link secreto para cada pessoa (HTML + CSS + JS)

Organizar amigo secreto pelo WhatsApp costuma dar trabalho: alguém precisa sortear sem ver o resultado, casais não podem se tirar e sempre tem quem tire o próprio nome. Esta página resolve isso: você cadastra as pessoas e as restrições, sorteia e recebe **um link secreto para cada participante**. Cada pessoa abre o próprio link e vê só quem ela tirou, junto com a data, o local e o valor combinado.

Sem cadastro, sem app e sem servidor: tudo roda no navegador.

**Acesse online:** https://micdog22.github.io/amigo-secreto/

## Recursos

- Ninguém tira a si mesmo.
- Restrições do tipo "Fulano não pode tirar Beltrano", em um sentido ou nos dois (ótimo para casais).
- Opção **corrente única**: todo mundo forma uma roda só, ideal para revelar em sequência (quem foi revelado revela o próximo).
- Quando as restrições tornam o sorteio impossível, a página explica o motivo (por exemplo: "Ana e Bruno só podem tirar Carla: são 2 pessoas para 1 nome").
- Informações do evento: nome, data, horário, local, valor sugerido (em reais) e observações.
- Para cada pessoa: **Copiar mensagem** ("Oi, Ana! Seu amigo secreto está neste link: …") e **Enviar pelo WhatsApp**, com marcação de quem já recebeu.
- O resultado completo só aparece se quem organiza clicar em **Mostrar resultado completo** e confirmar.
- Tela de revelação com "Você é Fulano?" e uma animação de presente (que respeita a preferência por menos movimento).
- Os dados ficam salvos só no seu navegador (`localStorage`).

## Como usar

1. Preencha as informações do evento (tudo opcional).
2. Adicione os participantes, um por um ou colando vários nomes de uma vez.
3. Se precisar, adicione restrições. Marque "Nos dois sentidos" para casais.
4. Escolha se quer corrente única e clique em **Sortear**.
5. Envie para cada pessoa o link dela, pelo botão do WhatsApp ou copiando a mensagem.

Se você mudar participantes ou restrições depois do sorteio, a página avisa que os links ainda são do sorteio anterior. Sortear de novo gera links novos; os antigos continuam mostrando o resultado antigo, então reenvie para todo mundo.

## Sobre a privacidade dos links

O resultado vai **dentro do próprio link**, depois do `#`. Essa parte do endereço não é enviada ao servidor e não existe banco de dados: não há onde o resultado vazar.

O conteúdo do link é um pequeno JSON (`{v, from, to, event}`) misturado com uma chave aleatória de 8 bytes (XOR) e codificado em base64url. A chave vai junto no próprio link. Isso **evita espiadas acidentais**, mas **não é criptografia**: quem souber decodificar consegue ler o conteúdo. Por isso, quem organiza não deve abrir os links dos outros.

## Como funciona o sorteio

1. Primeiro a página confere se o sorteio é possível. Ela monta um emparelhamento máximo (algoritmo de Kuhn) entre "quem tira" e "quem é tirado". Se não existir sorteio válido, o teorema de Hall aponta o grupo de pessoas que disputa menos nomes do que gente, e é isso que aparece na explicação. Na corrente única, a página também confere se o grupo não ficou dividido em partes que não se alcançam.
2. Depois tenta embaralhamentos uniformes (Fisher-Yates com `crypto.getRandomValues`) até achar um que respeite todas as regras. Assim, cada combinação válida tem a mesma chance de sair. Na corrente única, embaralha a ordem da roda.
3. Se as restrições forem tantas que os embaralhamentos não acham resultado rápido, entra um backtracking aleatório (quem tem menos opções escolhe primeiro; na corrente única, com poda de quem ficaria sem saída). No sorteio comum, o emparelhamento do passo 1 garante um resultado se o backtracking passar do limite de esforço.

## Como rodar localmente

Módulos ES não carregam via `file://`, então sirva a pasta com um servidor estático:

```bash
python3 -m http.server 8000
```

E abra http://localhost:8000.

## Testes

```bash
npm test
```

(ou `node --test`, com Node 20 ou mais novo). Os testes cobrem validade do sorteio em centenas de rodadas aleatórias, restrições, corrente única, distribuição uniforme, detecção e explicação de casos impossíveis, ida e volta dos links (com acentos e emoji), valores em reais e datas.

## Contribuindo

Issues e pull requests são bem-vindos.

## Licença

MIT. Veja [LICENSE](LICENSE).
