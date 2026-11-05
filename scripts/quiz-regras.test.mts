// Rodar: node --experimental-strip-types --test scripts/quiz-regras.test.mts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aposAcerto, aposErro, aposDecisao, marcoDe, nivelPorAcertos, nivelDaPergunta, pontosDaResposta, valorDoPremio, MARCOS_PADRAO, type Rodada } from '../src/lib/quizRegras.ts'

const novo = (): Rodada => ({ estado: 'jogando', acertos: 0, marco: 0, pontos: 0, erros: 0 })
function errar(r: Rodada, n: number) { for (let i = 0; i < n; i++) r = aposErro(r); return r }
function acertar(r: Rodada, n: number) { for (let i = 0; i < n; i++) r = aposAcerto(r, 100); return r }

test('3 erros são perdoados na fase segura, o 4º encerra com o marco', () => {
  let r = acertar(novo(), 22)
  r = errar(r, 3)
  assert.equal(r.estado, 'jogando'); assert.equal(r.erros, 3)
  r = aposErro(r)
  assert.equal(r.estado, 'encerrada'); assert.equal(r.marco, 3)
})
test('erro perdoado não muda acertos nem marco', () => { const r = errar(acertar(novo(), 12), 1); assert.equal(r.acertos, 12); assert.equal(r.marco, 2); assert.equal(r.estado, 'jogando') })
test('começar errando 4 vezes encerra sem prêmio', () => { const r = errar(novo(), 4); assert.equal(r.estado, 'encerrada'); assert.equal(r.marco, 0) })
test('9 acertos e 4 erros => 0%', () => assert.equal(errar(acertar(novo(), 9), 4).marco, 0))
test('12 acertos e 4 erros => 2%', () => assert.equal(errar(acertar(novo(), 12), 4).marco, 2))
test('30 acertos cai no portão', () => assert.equal(acertar(novo(), 30).estado, 'portao'))
test('30 acertos e parar => 5%', () => assert.equal(aposDecisao(acertar(novo(), 30), true).marco, 5))
function ate(n: number) {
  let r = aposDecisao(acertar(novo(), 30), false)
  for (let i = 30; i < n; i++) { r = aposAcerto(r, 100); if (r.estado === 'portao' && r.acertos < n) r = aposDecisao(r, false) }
  return r
}
test('33 acertos, arriscou e errou => 0%', () => {
  const r = ate(33)
  assert.equal(r.acertos, 33)
  assert.equal(aposErro(aposDecisao(r, false)).marco, 0)
})
test('35 acertos e parar => 6%', () => {
  const r = ate(35)
  assert.equal(r.acertos, 35)
  assert.equal(aposDecisao(r, true).marco, 6)
})
test('42 acertos e erro após arriscar => 0%', () => {
  const r = ate(42)
  assert.equal(r.acertos, 42)
  assert.equal(aposErro(aposDecisao(r, false)).marco, 0)
})
test('45 acertos => 10% garantido, erro depois mantém 10%', () => {
  const r = ate(45)
  assert.equal(r.acertos, 45)
  assert.equal(r.estado, 'jogando')
  assert.equal(aposErro(r).marco, 10)
  assert.deepEqual([9, 10, 20, 30, 35, 40, 45].map(marcoDe), [0, 2, 3, 5, 6, 8, 10])
  assert.deepEqual([0, 9, 10, 19, 20, 29, 30, 39, 40, 45].map(nivelPorAcertos), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
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
