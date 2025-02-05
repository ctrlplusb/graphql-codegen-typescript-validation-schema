import { buildSchema } from 'graphql';
import { plugin } from '../src/index';

describe('myzod', () => {
  test.each([
    [
      'non-null and defined',
      /* GraphQL */ `
        input PrimitiveInput {
          a: ID!
          b: String!
          c: Boolean!
          d: Int!
          e: Float!
        }
      `,
      [
        'export function PrimitiveInputSchema(): myzod.Type<PrimitiveInput> {',
        'a: myzod.string()',
        'b: myzod.string()',
        'c: myzod.boolean()',
        'd: myzod.number()',
        'e: myzod.number()',
      ],
    ],
    [
      'nullish',
      /* GraphQL */ `
        input PrimitiveInput {
          a: ID
          b: String
          c: Boolean
          d: Int
          e: Float
          z: String! # no defined check
        }
      `,
      [
        'export function PrimitiveInputSchema(): myzod.Type<PrimitiveInput> {',
        // alphabet order
        'a: myzod.string().optional().nullable(),',
        'b: myzod.string().optional().nullable(),',
        'c: myzod.boolean().optional().nullable(),',
        'd: myzod.number().optional().nullable(),',
        'e: myzod.number().optional().nullable(),',
      ],
    ],
    [
      'array',
      /* GraphQL */ `
        input ArrayInput {
          a: [String]
          b: [String!]
          c: [String!]!
          d: [[String]]
          e: [[String]!]
          f: [[String]!]!
        }
      `,
      [
        'export function ArrayInputSchema(): myzod.Type<ArrayInput> {',
        'a: myzod.array(myzod.string().nullable()).optional().nullable(),',
        'b: myzod.array(myzod.string()).optional().nullable(),',
        'c: myzod.array(myzod.string()),',
        'd: myzod.array(myzod.array(myzod.string().nullable()).optional().nullable()).optional().nullable(),',
        'e: myzod.array(myzod.array(myzod.string().nullable())).optional().nullable(),',
        'f: myzod.array(myzod.array(myzod.string().nullable()))',
      ],
    ],
    [
      'ref input object',
      /* GraphQL */ `
        input AInput {
          b: BInput!
        }
        input BInput {
          c: CInput!
        }
        input CInput {
          a: AInput!
        }
      `,
      [
        'export function AInputSchema(): myzod.Type<AInput> {',
        'b: myzod.lazy(() => BInputSchema())',
        'export function BInputSchema(): myzod.Type<BInput> {',
        'c: myzod.lazy(() => CInputSchema())',
        'export function CInputSchema(): myzod.Type<CInput> {',
        'a: myzod.lazy(() => AInputSchema())',
      ],
    ],
    [
      'nested input object',
      /* GraphQL */ `
        input NestedInput {
          child: NestedInput
          childrens: [NestedInput]
        }
      `,
      [
        'export function NestedInputSchema(): myzod.Type<NestedInput> {',
        'child: myzod.lazy(() => NestedInputSchema().optional().nullable()),',
        'childrens: myzod.array(myzod.lazy(() => NestedInputSchema().nullable())).optional().nullable()',
      ],
    ],
    [
      'enum',
      /* GraphQL */ `
        enum PageType {
          PUBLIC
          BASIC_AUTH
        }
        input PageInput {
          pageType: PageType!
        }
      `,
      [
        'export const PageTypeSchema = myzod.enum(PageType)',
        'export function PageInputSchema(): myzod.Type<PageInput> {',
        'pageType: PageTypeSchema',
      ],
    ],
    [
      'camelcase',
      /* GraphQL */ `
        input HTTPInput {
          method: HTTPMethod
          url: URL!
        }

        enum HTTPMethod {
          GET
          POST
        }

        scalar URL # unknown scalar, should be any (definedNonNullAnySchema)
      `,
      [
        'export function HttpInputSchema(): myzod.Type<HttpInput> {',
        'export const HttpMethodSchema = myzod.enum(HttpMethod)',
        'method: HttpMethodSchema',
        'url: definedNonNullAnySchema',
      ],
    ],
  ])('%s', async (_, textSchema, wantContains) => {
    const schema = buildSchema(textSchema);
    const result = await plugin(schema, [], { schema: 'myzod' }, {});
    expect(result.prepend).toContain("import * as myzod from 'myzod'");

    for (const wantContain of wantContains) {
      expect(result.content).toContain(wantContain);
    }
  });

  it('with scalars', async () => {
    const schema = buildSchema(/* GraphQL */ `
      input Say {
        phrase: Text!
        times: Count!
      }

      scalar Count
      scalar Text
    `);
    const result = await plugin(
      schema,
      [],
      {
        schema: 'myzod',
        scalars: {
          Text: 'string',
          Count: 'number',
        },
      },
      {}
    );
    expect(result.content).toContain('phrase: myzod.string()');
    expect(result.content).toContain('times: myzod.number()');
  });

  it('with importFrom', async () => {
    const schema = buildSchema(/* GraphQL */ `
      input Say {
        phrase: String!
      }
    `);
    const result = await plugin(
      schema,
      [],
      {
        schema: 'myzod',
        importFrom: './types',
      },
      {}
    );
    expect(result.prepend).toContain("import { Say } from './types'");
    expect(result.content).toContain('phrase: myzod.string()');
  });

  it('with enumsAsTypes', async () => {
    const schema = buildSchema(/* GraphQL */ `
      enum PageType {
        PUBLIC
        BASIC_AUTH
      }
    `);
    const result = await plugin(
      schema,
      [],
      {
        schema: 'myzod',
        enumsAsTypes: true,
      },
      {}
    );
    expect(result.content).toContain("export type PageTypeSchema = myzod.literals('PUBLIC', 'BASIC_AUTH')");
  });

  it('with notAllowEmptyString', async () => {
    const schema = buildSchema(/* GraphQL */ `
      input PrimitiveInput {
        a: ID!
        b: String!
        c: Boolean!
        d: Int!
        e: Float!
      }
    `);
    const result = await plugin(
      schema,
      [],
      {
        schema: 'myzod',
        notAllowEmptyString: true,
      },
      {}
    );
    const wantContains = [
      'export function PrimitiveInputSchema(): myzod.Type<PrimitiveInput> {',
      'a: myzod.string().min(1),',
      'b: myzod.string().min(1),',
      'c: myzod.boolean(),',
      'd: myzod.number(),',
      'e: myzod.number()',
    ];
    for (const wantContain of wantContains) {
      expect(result.content).toContain(wantContain);
    }
  });

  it('with scalarSchemas', async () => {
    const schema = buildSchema(/* GraphQL */ `
      input ScalarsInput {
        date: Date!
        email: Email
        str: String!
      }
      scalar Date
      scalar Email
    `);
    const result = await plugin(
      schema,
      [],
      {
        schema: 'myzod',
        scalarSchemas: {
          Date: 'myzod.date()',
          Email: 'myzod.string()', // generate the basic type. User can later extend it using `withPredicate(fn: (val: string) => boolean), errMsg?: string }`
        },
      },
      {}
    );
    const wantContains = [
      'export function ScalarsInputSchema(): myzod.Type<ScalarsInput> {',
      'date: myzod.date(),',
      'email: myzod.string()', // TODO: Test implementation
      'str: myzod.string()',
    ];
    for (const wantContain of wantContains) {
      expect(result.content).toContain(wantContain);
    }
  });
  it('with typesPrefix', async () => {
    const schema = buildSchema(/* GraphQL */ `
      input Say {
        phrase: String!
      }
    `);
    const result = await plugin(
      schema,
      [],
      {
        schema: 'myzod',
        typesPrefix: 'I',
        importFrom: './types',
      },
      {}
    );
    expect(result.prepend).toContain("import { ISay } from './types'");
    expect(result.content).toContain('export function ISaySchema(): myzod.Type<ISay> {');
  });
  it('with typesSuffix', async () => {
    const schema = buildSchema(/* GraphQL */ `
      input Say {
        phrase: String!
      }
    `);
    const result = await plugin(
      schema,
      [],
      {
        schema: 'myzod',
        typesSuffix: 'I',
        importFrom: './types',
      },
      {}
    );
    expect(result.prepend).toContain("import { SayI } from './types'");
    expect(result.content).toContain('export function SayISchema(): myzod.Type<SayI> {');
  });
  describe('issues #19', () => {
    it('string field', async () => {
      const schema = buildSchema(/* GraphQL */ `
        input UserCreateInput {
          profile: String @constraint(minLength: 1, maxLength: 5000)
        }

        directive @constraint(minLength: Int!, maxLength: Int!) on INPUT_FIELD_DEFINITION
      `);
      const result = await plugin(
        schema,
        [],
        {
          schema: 'myzod',
          directives: {
            constraint: {
              minLength: ['min', '$1', 'Please input more than $1'],
              maxLength: ['max', '$1', 'Please input less than $1'],
            },
          },
        },
        {}
      );
      const wantContains = [
        'export function UserCreateInputSchema(): myzod.Type<UserCreateInput> {',
        'profile: myzod.string().min(1, "Please input more than 1").max(5000, "Please input less than 5000").optional().nullable()',
      ];
      for (const wantContain of wantContains) {
        expect(result.content).toContain(wantContain);
      }
    });
    it('not null field', async () => {
      const schema = buildSchema(/* GraphQL */ `
        input UserCreateInput {
          profile: String! @constraint(minLength: 1, maxLength: 5000)
        }

        directive @constraint(minLength: Int!, maxLength: Int!) on INPUT_FIELD_DEFINITION
      `);
      const result = await plugin(
        schema,
        [],
        {
          schema: 'myzod',
          directives: {
            constraint: {
              minLength: ['min', '$1', 'Please input more than $1'],
              maxLength: ['max', '$1', 'Please input less than $1'],
            },
          },
        },
        {}
      );
      const wantContains = [
        'export function UserCreateInputSchema(): myzod.Type<UserCreateInput> {',
        'profile: myzod.string().min(1, "Please input more than 1").max(5000, "Please input less than 5000")',
      ];
      for (const wantContain of wantContains) {
        expect(result.content).toContain(wantContain);
      }
    });
    it('list field', async () => {
      const schema = buildSchema(/* GraphQL */ `
        input UserCreateInput {
          profile: [String] @constraint(minLength: 1, maxLength: 5000)
        }

        directive @constraint(minLength: Int!, maxLength: Int!) on INPUT_FIELD_DEFINITION
      `);
      const result = await plugin(
        schema,
        [],
        {
          schema: 'myzod',
          directives: {
            constraint: {
              minLength: ['min', '$1', 'Please input more than $1'],
              maxLength: ['max', '$1', 'Please input less than $1'],
            },
          },
        },
        {}
      );
      const wantContains = [
        'export function UserCreateInputSchema(): myzod.Type<UserCreateInput> {',
        'profile: myzod.array(myzod.string().nullable()).min(1, "Please input more than 1").max(5000, "Please input less than 5000").optional().nullable()',
      ];
      for (const wantContain of wantContains) {
        expect(result.content).toContain(wantContain);
      }
    });
  });

  describe('with withObjectType', () => {
    it('not generate if withObjectType false', async () => {
      const schema = buildSchema(/* GraphQL */ `
        type User {
          id: ID!
          name: String
        }
      `);
      const result = await plugin(
        schema,
        [],
        {
          schema: 'myzod',
        },
        {}
      );
      expect(result.content).not.toContain('export function UserSchema(): myzod.Type<User> {');
    });

    it('generate object type contains object type', async () => {
      const schema = buildSchema(/* GraphQL */ `
        type Book {
          author: Author
          title: String
        }

        type Author {
          books: [Book]
          name: String
        }
      `);
      const result = await plugin(
        schema,
        [],
        {
          schema: 'myzod',
          withObjectType: true,
        },
        {}
      );
      const wantContains = [
        'export function AuthorSchema(): myzod.Type<Author> {',
        "__typename: myzod.literal('Author').optional(),",
        'books: myzod.array(BookSchema().nullable()).optional().nullable(),',
        'name: myzod.string().optional().nullable()',

        'export function BookSchema(): myzod.Type<Book> {',
        "__typename: myzod.literal('Book').optional(),",
        'author: AuthorSchema().optional().nullable(),',
        'title: myzod.string().optional().nullable()',
      ];
      for (const wantContain of wantContains) {
        expect(result.content).toContain(wantContain);
      }

      for (const wantNotContain of ['Query', 'Mutation', 'Subscription']) {
        expect(result.content).not.toContain(wantNotContain);
      }
    });

    it('generate both input & type', async () => {
      const schema = buildSchema(/* GraphQL */ `
        scalar Date
        scalar Email
        input UserCreateInput {
          name: String!
          date: Date!
          email: Email!
        }
        type User {
          id: ID!
          name: String
          age: Int
          email: Email
          isMember: Boolean
          createdAt: Date!
        }

        type Mutation {
          _empty: String
        }

        type Query {
          _empty: String
        }

        type Subscription {
          _empty: String
        }
      `);
      const result = await plugin(
        schema,
        [],
        {
          schema: 'myzod',
          withObjectType: true,
          scalarSchemas: {
            Date: 'myzod.date()',
            Email: 'myzod.string().email()',
          },
        },
        {}
      );
      const wantContains = [
        // User Create Input
        'export function UserCreateInputSchema(): myzod.Type<UserCreateInput> {',
        'name: myzod.string(),',
        'date: myzod.date(),',
        'email: myzod.string().email()',
        // User
        'export function UserSchema(): myzod.Type<User> {',
        "__typename: myzod.literal('User').optional(),",
        'id: myzod.string(),',
        'name: myzod.string().optional().nullable(),',
        'age: myzod.number().optional().nullable(),',
        'email: myzod.string().email().optional().nullable(),',
        'isMember: myzod.boolean().optional().nullable(),',
        'createdAt: myzod.date()',
      ];
      for (const wantContain of wantContains) {
        expect(result.content).toContain(wantContain);
      }

      for (const wantNotContain of ['Query', 'Mutation', 'Subscription']) {
        expect(result.content).not.toContain(wantNotContain);
      }
    });
  });
});
