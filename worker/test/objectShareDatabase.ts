import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import type { ShareDatabase } from '../objectShares.js'

class Statement {
  readonly sql: string
  readonly values: (string | number)[]
  constructor(sql: string, values: (string | number)[] = []) {
    this.sql = sql
    this.values = values
  }
  bind(...values: (string | number)[]) { return new Statement(this.sql, values) }
}

export class ObjectShareTestDatabase implements ShareDatabase {
  readonly sqlite = new DatabaseSync(':memory:')
  constructor() {
    this.sqlite.exec(readFileSync(new URL('../object-shares.sql', import.meta.url), 'utf8'))
  }
  prepare(sql: string) { return new Statement(sql) }
  async batch(statements: Parameters<ShareDatabase['batch']>[0]) {
    this.sqlite.exec('BEGIN IMMEDIATE')
    try {
      const results = statements.map(statement => {
        if (!(statement instanceof Statement)) throw new Error('Foreign statement')
        return { results: this.sqlite.prepare(statement.sql).all(...statement.values), success: true }
      })
      this.sqlite.exec('COMMIT')
      return results
    } catch (error) {
      this.sqlite.exec('ROLLBACK')
      throw error
    }
  }
}
