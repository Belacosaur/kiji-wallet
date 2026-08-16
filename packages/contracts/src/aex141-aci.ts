export const IAEX141_ACI = [
  {
    contract: {
      kind: "contract_interface",
      name: "IAEX141",
      payable: false,
      typedefs: [
        {
          name: "metadata_type",
          vars: [],
          typedef: { variant: [{ URL: [] }, { OBJECT_ID: [] }, { MAP: [] }] }
        },
        {
          name: "metadata",
          vars: [],
          typedef: {
            variant: [
              { MetadataIdentifier: ["string"] },
              { MetadataMap: [{ map: ["string", "string"] }] }
            ]
          }
        },
        {
          name: "meta_info",
          vars: [],
          typedef: {
            record: [
              { name: "name", type: "string" },
              { name: "symbol", type: "string" },
              { name: "base_url", type: { option: ["string"] } },
              { name: "metadata_type", type: "IAEX141.metadata_type" }
            ]
          }
        }
      ],
      functions: [
        {
          name: "aex141_extensions",
          arguments: [],
          returns: { list: ["string"] },
          stateful: false,
          payable: false
        },
        {
          name: "meta_info",
          arguments: [],
          returns: "IAEX141.meta_info",
          stateful: false,
          payable: false
        },
        {
          name: "metadata",
          arguments: [{ name: "token_id", type: "int" }],
          returns: { option: ["IAEX141.metadata"] },
          stateful: false,
          payable: false
        },
        {
          name: "total_supply",
          arguments: [],
          returns: "int",
          stateful: false,
          payable: false
        },
        {
          name: "balance",
          arguments: [{ name: "account", type: "address" }],
          returns: { option: ["int"] },
          stateful: false,
          payable: false
        },
        {
          name: "owner",
          arguments: [{ name: "token_id", type: "int" }],
          returns: { option: ["address"] },
          stateful: false,
          payable: false
        },
        {
          name: "transfer",
          arguments: [
            { name: "to", type: "address" },
            { name: "token_id", type: "int" },
            { name: "data", type: { option: ["string"] } }
          ],
          returns: "unit",
          stateful: true,
          payable: false
        }
      ]
    }
  }
] as const;
