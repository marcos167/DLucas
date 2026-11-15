import { describe, expect, it } from 'vitest'
import { buildImportPreview, decodeTextFile, IMPORT_TEMPLATE, parseDelimited, splitStreetLine } from './import'

describe('leitura de texto delimitado', () => {
  it('detecta ponto e vírgula, vírgula e tabulação', () => {
    expect(parseDelimited('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseDelimited('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']])
    expect(parseDelimited('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']])
  })

  it('respeita aspas, separador dentro de aspas e quebra de linha do Windows', () => {
    const rows = parseDelimited('codigo;endereco\r\n"A1";"Rua X; fundos"\r\n"A2";"diz ""oi"""\r\n')
    expect(rows).toEqual([['codigo', 'endereco'], ['A1', 'Rua X; fundos'], ['A2', 'diz "oi"']])
  })

  it('ignora linhas vazias e o marcador BOM', () => {
    expect(parseDelimited('\uFEFFa;b\n\n1;2\n;\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('endereço em uma coluna só', () => {
  it('separa número e complemento', () => {
    expect(splitStreetLine('Rua das Flores, 123 - Apto 4')).toEqual({
      street: 'Rua das Flores', number: '123', complement: 'Apto 4',
    })
    expect(splitStreetLine('Av. Paulista, 1000')).toEqual({ street: 'Av. Paulista', number: '1000', complement: null })
    expect(splitStreetLine('Rua das Flores 123')).toEqual({ street: 'Rua das Flores', number: '123', complement: null })
    expect(splitStreetLine('Rua A, s/n')).toEqual({ street: 'Rua A', number: 's/n', complement: null })
  })

  it('não confunde número no nome da rua com número do imóvel', () => {
    expect(splitStreetLine('Rua 25 de Março, 1000 - Loja 3')).toEqual({
      street: 'Rua 25 de Março', number: '1000', complement: 'Loja 3',
    })
    expect(splitStreetLine('Rua 7 de Setembro 100')).toEqual({ street: 'Rua 7 de Setembro', number: '100', complement: null })
    expect(splitStreetLine('Avenida 9 de Julho')).toEqual({ street: 'Avenida 9 de Julho', number: null, complement: null })
  })
})

describe('prévia da importação', () => {
  it('reconhece cabeçalhos em português com acento e caixa variada', () => {
    const preview = buildImportPreview([
      'Código;Destinatário;CEP;Endereço;Número;Bairro;Cidade;UF;Observações;Refrigerado',
      'pct-1;Maria;02710-000;Rua A;10;Vila X;São Paulo;sp;Portaria;Sim',
    ].join('\n'))
    expect(preview.missingRequired).toEqual([])
    expect(preview.columns.map((c) => c.field)).toEqual([
      'tracking_code', 'recipient_name', 'zip_code', 'street', 'number', 'district', 'city', 'state',
      'delivery_instructions', 'is_temperature_controlled',
    ])
    expect(preview.rows[0]).toMatchObject({
      line: 2, tracking_code: 'PCT-1', recipient_name: 'Maria', zip_code: '02710000', street: 'Rua A',
      number: '10', district: 'Vila X', city: 'São Paulo', state: 'SP', delivery_instructions: 'Portaria',
      is_temperature_controlled: true,
    })
  })

  it('aponta colunas obrigatórias ausentes', () => {
    const preview = buildImportPreview('cep;bairro\n02710-000;Vila X')
    expect(preview.missingRequired).toEqual(['tracking_code', 'recipient_name', 'street'])
    expect(preview.rows).toHaveLength(0)
  })

  it('usa "cliente" como destinatário só quando não há outra coluna para ele', () => {
    const alone = buildImportPreview('codigo;cliente;endereco\nA1;Ana;Rua A, 1')
    expect(alone.rows[0].recipient_name).toBe('Ana')
    const both = buildImportPreview('codigo;cliente;destinatario;endereco\nA1;Farmácia Z;Ana;Rua A, 1')
    expect(both.rows[0]).toMatchObject({ recipient_name: 'Ana', sender_name: 'Farmácia Z' })
  })

  it('rejeita linha sem dado obrigatório e código repetido, sem perder as demais', () => {
    const preview = buildImportPreview([
      'codigo;destinatario;cep;endereco;numero',
      'A1;Ana;02710-000;Rua A;1',
      ';Bia;02710-000;Rua B;2',
      'A3;;02710-000;Rua C;3',
      'A4;Dani;02710-000;;4',
      'a1;Eva;02710-000;Rua E;5',
      'A6;Fábio;02710-000;Rua F;6',
    ].join('\n'))
    expect(preview.rows.map((r) => r.tracking_code)).toEqual(['A1', 'A6'])
    expect(preview.stats).toMatchObject({ lines: 6, valid: 2, rejected: 4 })
    const errors = preview.issues.filter((i) => i.level === 'error')
    expect(errors.map((i) => i.line)).toEqual([3, 4, 5, 6])
    expect(errors[3].message).toContain('repetido')
  })

  it('importa CEP inválido com aviso (vira exceção na distribuição)', () => {
    const preview = buildImportPreview('codigo;destinatario;cep;endereco\nA1;Ana;123;Rua A, 1\nA2;Bia;;Rua B, 2')
    expect(preview.rows.map((r) => r.zip_code)).toEqual([null, null])
    expect(preview.stats.invalidZip).toBe(2)
    expect(preview.issues.every((i) => i.level === 'warning')).toBe(true)
  })

  it('devolve o zero do CEP cortado pela planilha e avisa', () => {
    const preview = buildImportPreview('codigo;destinatario;cep;endereco\nA1;Ana;2710000;Rua A, 1')
    expect(preview.rows[0].zip_code).toBe('02710000')
    expect(preview.issues).toHaveLength(1)
    expect(preview.issues[0]).toMatchObject({ level: 'warning', field: 'zip_code' })
    expect(preview.stats.invalidZip).toBe(0)
  })

  it('recusa código que a planilha transformou em notação científica', () => {
    const preview = buildImportPreview('codigo;destinatario;endereco\n1,23457E+14;Ana;Rua A, 1')
    expect(preview.rows).toHaveLength(0)
    expect(preview.issues[0].message).toContain('notação científica')
  })

  it('separa número e complemento quando não há coluna de número', () => {
    const preview = buildImportPreview('codigo;destinatario;cep;endereco\nA1;Ana;02710-000;Rua das Flores, 100 - Apto 12')
    expect(preview.rows[0]).toMatchObject({ street: 'Rua das Flores', number: '100', complement: 'Apto 12' })
  })

  it('conta endereços: dois pacotes no mesmo prédio são um endereço só', () => {
    const preview = buildImportPreview([
      'codigo;destinatario;cep;endereco;numero;complemento',
      'A1;Ana;02710-000;Rua das Flores;100;Apto 12',
      'A2;Bia;02710-000;R. das Flôres;100;Apto 45',
      'A3;Caio;02710-000;Rua das Flores;102;',
    ].join('\n'))
    expect(preview.stats).toMatchObject({ valid: 3, addresses: 2 })
  })

  it('aceita coordenadas com vírgula decimal e ignora as inválidas com aviso', () => {
    const preview = buildImportPreview([
      'codigo;destinatario;endereco;latitude;longitude',
      'A1;Ana;Rua A, 1;-23,5505;-46,6333',
      'A2;Bia;Rua B, 2;-93,5;-46,6',
      'A3;Caio;Rua C, 3;-23,5;',
    ].join('\n'))
    expect(preview.rows[0]).toMatchObject({ latitude: -23.5505, longitude: -46.6333 })
    expect(preview.rows[1]).toMatchObject({ latitude: null, longitude: null })
    expect(preview.rows[2]).toMatchObject({ latitude: null, longitude: null })
    expect(preview.issues.filter((i) => i.field === 'latitude')).toHaveLength(2)
  })

  it('lê células copiadas de uma planilha (tabulação)', () => {
    const preview = buildImportPreview('codigo\tdestinatario\tcep\tendereco\tnumero\nA1\tAna\t02710-000\tRua A\t1')
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0].number).toBe('1')
  })

  it('o modelo oferecido para download é ele mesmo válido', () => {
    const preview = buildImportPreview(IMPORT_TEMPLATE)
    expect(preview.missingRequired).toEqual([])
    expect(preview.issues).toEqual([])
    expect(preview.stats).toMatchObject({ valid: 2, addresses: 1 })
    expect(preview.rows[1].is_temperature_controlled).toBe(true)
  })

  it('texto vazio não quebra', () => {
    expect(buildImportPreview('').stats.lines).toBe(0)
    expect(buildImportPreview('   \n ').rows).toEqual([])
  })
})

describe('codificação do arquivo', () => {
  it('lê UTF-8 e cai para Windows-1252 (padrão do Excel no Brasil)', () => {
    expect(decodeTextFile(new TextEncoder().encode('São Paulo').buffer as ArrayBuffer)).toBe('São Paulo')
    const latin1 = new Uint8Array([0x53, 0xe3, 0x6f, 0x20, 0x50, 0x61, 0x75, 0x6c, 0x6f])
    expect(decodeTextFile(latin1.buffer as ArrayBuffer)).toBe('São Paulo')
  })
})
