// Rodar: node --experimental-strip-types --test scripts/quiz-regras.test.mts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aposAcerto, aposErro, aposDecisao, marcoDe, nivelDaPergunta, pontosDaResposta, valorDoPremio, MARCOS_PADRAO, type Rodada } from '../src/lib/quizRegras.ts'

const novo = (): Rodada => ({ estado: 'jogando', acertos: 0, marco: 0, pontos: 0, erros: 0 })
function errar(r: Rodada, n: number) { for (let i = 0; i < n; i++) r = aposErro(r); return r }
function acertar(r: Rodada, n: number) { for (let i = 0; i < n; i++) r = aposAcerto(r, 100); return r }

test('3 erros são perdoados na fase segura, o 4º encerra com o marco', () => {
  let r = acertar(novo(), 12)
  r = errar(r, 3)
  assert.equal(r.estado, 'jogando'); assert.equal(r.erros, 3)
  r = aposErro(r)
  assert.equal(r.estado, 'encerrada'); assert.equal(r.marco, 3)
})
test('erro perdoado não muda acertos nem marco', () => { const r = errar(acertar(novo(), 7), 1); assert.equal(r.acertos, 7); assert.equal(r.marco, 2); assert.equal(r.estado, 'jogando') })
test('começar errando 4 vezes encerra sem prêmio', () => { const r = errar(novo(), 4); assert.equal(r.estado, 'encerrada'); assert.equal(r.marco, 0) })
test('4 acertos e 4 erros => 0%', () => assert.equal(errar(acertar(novo(), 4), 4).marco, 0))
test('7 acertos e 4 erros => 2%', () => assert.equal(errar(acertar(novo(), 7), 4).marco, 2))
test('15 acertos cai no portão', () => assert.equal(acertar(novo(), 15).estado, 'portao'))
test('15 acertos e parar => 5%', () => assert.equal(aposDecisao(acertar(novo(), 15), true).marco, 5))
test('18 acertos, arriscou e errou => 0%', () => {
  let r = aposDecisao(acertar(novo(), 15), false)
  assert.equal(r.estado, 'risco')
  r = aposAcerto(r, 100); r = aposDecisao(r, false); r = aposAcerto(r, 100); r = aposDecisao(r, false); r = aposAcerto(r, 100)
  assert.equal(r.acertos, 18)
  assert.equal(aposErro(aposDecisao(r, false)).marco, 0)
})
test('22 acertos e parar => 6%', () => {
  let r = aposDecisao(acertar(novo(), 15), false)
  for (let i = 0; i < 7; i++) { r = aposAcerto(r, 100); if (r.estado === 'portao' && i < 6) r = aposDecisao(r, false) }
  assert.equal(r.acertos, 22)
  assert.equal(aposDecisao(r, true).marco, 6)
})
test('27 acertos e erro após arriscar => 0%', () => {
  let r = aposDecisao(acertar(novo(), 15), false)
  for (let i = 0; i < 12; i++) { r = aposAcerto(r, 100); if (r.estado === 'portao' && i < 11) r = aposDecisao(r, false) }
  assert.equal(r.acertos, 27)
  assert.equal(aposErro(aposDecisao(r, false)).marco, 0)
})
test('30 acertos => 10% garantido, erro depois mantém 10%', () => {
  let r = aposDecisao(acertar(novo(), 15), false)
  for (let i = 0; i < 15; i++) { r = aposAcerto(r, 100); if (r.estado === 'portao') r = aposDecisao(r, false) }
  assert.equal(r.acertos, 30)
  assert.equal(r.estado, 'jogando')
  assert.equal(aposErro(r).marco, 10)
  assert.equal(marcoDe(45), 10)
})
test('níveis das perguntas', () => {
  assert.deepEqual([1, 5, 6, 10, 11, 40].map(nivelDaPergunta), [1, 1, 2, 2, 3, 3])
})
test('pontos: 100 + 20/s restante, máx 200', () => {
  assert.equal(pontosDaResposta(5000), 200)
  assert.equal(pontosDaResposta(4999), 180)
  assert.equal(pontosDaResposta(900), 100)
  assert.equal(pontosDaResposta(-50), 100)
  assert.equal(pontosDaResposta(10000), 200)
})
test('valor do prêmio: percentual com teto e fixo', () => {
  assert.equal(valorDoPremio({ modo: 'percentual', marco: 5, marcos: MARCOS_PADRAO, base: 200, teto: 50 }), 10)
  assert.equal(valorDoPremio({ modo: 'percentual', marco: 10, marcos: MARCOS_PADRAO, base: 1000, teto: 50 }), 50)
  assert.equal(valorDoPremio({ modo: 'fixo', marco: 3, marcos: { '3': 7.5 }, base: 999, teto: 1 }), 7.5)
  assert.equal(valorDoPremio({ modo: 'fixo', marco: 0, marcos: MARCOS_PADRAO, base: 100, teto: 50 }), 0)
})
