// Certificado PÚBLICO da "Trindade Online Root CA v2" — a autoridade que
// assina o certificado de identidade do site (ver QZ_CERTIFICATE em
// qzPrint.ts). Público de propósito, sem problema nenhum em expor/baixar
// (é só a chave PRIVADA da CA que precisa ficar em segredo, e essa nunca
// foi salva em lugar nenhum — só existiu na hora de assinar).
//
// Precisa ser importado no QZ Tray de cada loja como "trustedRootCert"
// (arquivo qz-tray.properties) pra permissão de impressão persistir de
// vez — sem isso, o QZ Tray pede permissão de novo a cada tanto, mesmo
// marcando "lembrar" (ver instruções em /painel/pedidos, aba impressora).
export const QZ_ROOT_CA_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIFsDCCA5igAwIBAgIUJTzcUHVyEoDafz6/O813A5IGtYIwDQYJKoZIhvcNAQEN
BQAwbzELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlJKMRQwEgYDVQQHDAtTYW8gR29u
Y2FsbzEYMBYGA1UECgwPVHJpbmRhZGUgT25saW5lMSMwIQYDVQQDDBpUcmluZGFk
ZSBPbmxpbmUgUm9vdCBDQSB2MjAgFw0yNjA5MTAyMjA4MzFaGA8yMDU2MDkwMjIy
MDgzMVowbzELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlJKMRQwEgYDVQQHDAtTYW8g
R29uY2FsbzEYMBYGA1UECgwPVHJpbmRhZGUgT25saW5lMSMwIQYDVQQDDBpUcmlu
ZGFkZSBPbmxpbmUgUm9vdCBDQSB2MjCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCC
AgoCggIBAMydrXwT6+nUdkyoecDpyYpn6lurm9bftbKi+rnRJwjq43G5wcXofihQ
ejdI6UbBMDgrMOs12eaM1k0lxJyf/QyA2eu7X7vPSxIFoZIvbURCr8cCeCfoidsV
PjR8Uqqoue+fWEcCHCMWP2CnwskElR3DyxL9aP3UpM0g02+Arwu5d1bJdQUDuebC
mWGR0JI8loK7HQ/lFc5nXWVOiO/5Oa3g0MyUdudHX9VCfCmQfNB64RkB0+QY7nhf
+CvwQvIfy9ir19pdC3ZhHugt0A+aZQvWZwylzAVIU22c4Va858w+cNTiT+uOTbGv
78EC61WSByCopuX6muzWwcxMsNg4CFgqOaVEhBbQZuAlX/VFZCtvJVI7GCRhWO1q
Z4olUWw9ZqHrF3hZIgGDEMIH212OIFgkxEYJmfurrmugilkGt71ljR3PfP6EeEKq
li281JeaU94vk5IzVXZ+iTqcJGq+3fIxXOu6MeZwVhxZfdR+B/dFwOpUU4uPPKXz
m+wVnecXx8siYwfGaHV71M6clw3Pyws5Yco1IsqpYn1xEp+x54gsABJOAgnqO4lU
59T8HGdTOdQopxFuRlilKUE9pHahZa+QZs90QkIh9QX8YmLWFGTMAYMqpf9BdF2M
0V1WpgwC/8efC/c2ZX55cwfEuKnBfLEnZP75DV8DInyCCkCdB0ZTAgMBAAGjQjBA
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMB0GA1UdDgQWBBTByRFl
FeaRiPCzjywXkobUL9O7jDANBgkqhkiG9w0BAQ0FAAOCAgEAfRAB8FjpRuH84/jr
A7h/17WylKm4Jre+9VijsQdWfu84LNe4KOBTIi8Bd46SZobYNyUZI8j/LZCxZWfH
wFDGVaXEi0QZ6pqJhnydltJJ9F2Z5zDfSovSUHicRbOeL/LmW56kHTRIZohtzdDd
wLjDnAZJVFA/EMNdPSAZMONcuJxSc3B+/MC/rkrHCqRCAYtN4odu/vBpBSlGLUQ7
GJbPGaWl5xctf26UT+0+oXbOPCy/wxl8yGb3TnmbqRCiXJlzQ1K2TXdn17tud1fj
el5IyjsuGhtLBX/gcV3ArJ8KoJemscF62xkNTPebwR9g8AmG6e+mE0fueJ8ZyG7Z
MsB0tGhAiM6rD/f0Jy90t0bUamxX/MnbaceEvPHCEDc9mkSwvWGUSzcDOyDHMYI1
A11NaE4PucBhE2/l4TFw0iIIxVQLZI/6Jacp/BM9Ve58BsWNjNr06fbXJXsM8as+
2cxSZJizWKVV0pwLzuhsp/ygfOwgj5To1hlhAY6aO8uowWcq7lFRPgdBax9Br0pk
rnuMWQQwGuTCTFg5wPXIA9o/W4RY6UEPBtUdRodURrhvcUhE0TWaeZOiFbRrD3fe
RS7/f+tF8Nt7n5YprkBDgaHfsfv7Opb+urhzmStsl/lKJuiRnad+HBgrUuQHX/Nv
LwFBQQgvVm/XTl4kOBlWYl60JzQ=
-----END CERTIFICATE-----`
