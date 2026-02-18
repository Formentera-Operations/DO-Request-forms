import snowflake from 'snowflake-sdk';

// Configure Snowflake to use fewer resources
snowflake.configure({ logLevel: 'ERROR' });

export interface SnowflakeCheck {
  CHECK_NUMBER: string;
  ENTITY_CODE: string;
  ENTITY_NAME: string;
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
 * Fetch checks from DIM_REVENUE_CHECK_REGISTER.
 * Returns CHECK_NUMBER with associated ENTITY_CODE and ENTITY_NAME.
 */
export async function getChecks(search?: string): Promise<SnowflakeCheck[]> {
  let sql = `SELECT DISTINCT CHECK_NUMBER, ENTITY_CODE, ENTITY_NAME FROM DIM_REVENUE_CHECK_REGISTER WHERE CHECK_TYPE = 'CHECK' AND RECONCILED != 'Yes'`;
  const binds: any[] = [];

  if (search && search.trim()) {
    sql += ` AND CHECK_NUMBER ILIKE ?`;
    binds.push(`%${search}%`);
  }

  sql += ` ORDER BY CHECK_NUMBER LIMIT 50`;
  return querySnowflake<SnowflakeCheck>(sql, binds);
}
