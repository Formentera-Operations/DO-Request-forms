import snowflake from 'snowflake-sdk';

// Configure Snowflake to use fewer resources
snowflake.configure({ logLevel: 'ERROR' });

export interface SnowflakeCheck {
  CHECK_NUMBER: string;
  ENTITY_CODE: string;
  ENTITY_NAME: string;
  CHECK_AMOUNT: number;
  CHECK_DATE: string;
}

export interface SnowflakeOwner {
  OWNER_CODE: string;
  OWNER_NAME: string;
}

export interface SnowflakeWell {
  COST_CENTER_NUMBER: string;
  WELL_NAME: string;
  SEARCH_KEY: string;
}

/**
 * Execute a query against Snowflake and return results.
 * Connections are created per-request and destroyed after use.
 */
export async function querySnowflake<T = any>(
  sqlText: string,
  binds: any[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    // Restore newlines in PEM key (Vercel env vars strip them)
    const privateKey = (process.env.SNOWFLAKE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    const connection = snowflake.createConnection({
      account: process.env.SNOWFLAKE_ACCOUNT!,
      username: process.env.SNOWFLAKE_USERNAME!,
      authenticator: 'SNOWFLAKE_JWT',
      privateKey,
      database: process.env.SNOWFLAKE_DATABASE!,
      schema: process.env.SNOWFLAKE_SCHEMA!,
      warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
      role: process.env.SNOWFLAKE_ROLE!,
    });

    connection.connect((err) => {
      if (err) {
        console.error('Snowflake connection error:', err);
        return reject(err);
      }

      connection.execute({
        sqlText,
        binds,
        complete: (err, stmt, rows) => {
          connection.destroy((destroyErr) => {
            if (destroyErr) console.error('Error destroying connection:', destroyErr);
          });

          if (err) {
            console.error('Snowflake query error:', err);
            return reject(err);
          }

          resolve((rows || []) as T[]);
        },
      });
    });
  });
}

/**
 * Fetch owners from GOLD_DIM_OWNER.
 */
export async function getOwners(search?: string): Promise<SnowflakeOwner[]> {
  let sql = `SELECT OWNER_CODE, OWNER_NAME FROM FO_PRODUCTION_DB.GOLD_LAND.GOLD_DIM_OWNER`;
  const binds: any[] = [];

  if (search && search.trim()) {
    sql += ` WHERE (OWNER_CODE ILIKE ? OR OWNER_NAME ILIKE ?)`;
    binds.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY OWNER_CODE LIMIT 50`;
  return querySnowflake<SnowflakeOwner>(sql, binds);
}

/**
 * Fetch wells from GOLD_ASSET_HIERARCHY.DIM_WELL.
 */
export async function getWells(search?: string): Promise<SnowflakeWell[]> {
  let sql = `SELECT COST_CENTER_NUMBER, WELL_NAME, SEARCH_KEY FROM FO_PRODUCTION_DB.GOLD_ASSET_HIERARCHY.DIM_WELL`;
  const binds: any[] = [];

  if (search && search.trim()) {
    sql += ` WHERE (COST_CENTER_NUMBER ILIKE ? OR WELL_NAME ILIKE ?)`;
    binds.push(`%${search}%`, `%${search}%`);
  }

  sql += ` ORDER BY COST_CENTER_NUMBER LIMIT 50`;
  return querySnowflake<SnowflakeWell>(sql, binds);
}

/**
 * Fetch checks from GOLD_DIM_REVENUE_CHECK_REGISTER.
 * Returns CHECK_NUMBER with associated ENTITY_CODE and ENTITY_NAME.
 */
export async function getChecks(search?: string): Promise<SnowflakeCheck[]> {
  let sql = `SELECT DISTINCT CHECK_NUMBER, ENTITY_CODE, ENTITY_NAME, CHECK_AMOUNT, CHECK_DATE FROM FO_PRODUCTION_DB.GOLD_FINANCIAL.GOLD_DIM_REVENUE_CHECK_REGISTER WHERE CHECK_TYPE = 'CHECK' AND COMPANY_CODE = '200' AND RECONCILED != 'YES'`;
  const binds: any[] = [];

  if (search && search.trim()) {
    sql += ` AND CHECK_NUMBER ILIKE ?`;
    binds.push(`%${search}%`);
  }

  sql += ` ORDER BY CHECK_NUMBER LIMIT 50`;
  return querySnowflake<SnowflakeCheck>(sql, binds);
}
