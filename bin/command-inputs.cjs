// Generated spellings/types come from the public command registry; no second parser.
const inputs = require('./command-inputs.json')
exports.commandInput = (command, argv, parse, jsonArgument) => {
  if (!Object.hasOwn(inputs, command)) return undefined
  const contract = inputs[command], parsed = parse(argv), result = {}
  // Keep historical literal positionals, stopping before an explicitly declared option.
  const firstOption = argv.findIndex(arg => contract.fields.some(([,source]) => typeof source === 'string' && arg === '--'+source))
  const raw = firstOption < 0 ? argv : argv.slice(0,firstOption)
  for (const [name, source, type, required, truthy] of contract.fields) {
    const value = typeof source === 'number'
      ? (contract.rawPositionals ? raw : parsed._)[source] : parsed[source]
    const input = value === undefined ? contract.defaults?.[name] : value
    if ((input === undefined && !required) || (truthy && !input)) continue
    if(type === 'boolean-value' && input !== true && input !== false && input !== 'true' && input !== 'false')throw Error('--'+source+' requires true or false')
    result[name] = type === 'boolean-value' ? input === true || input === 'true' : type === 'number' ? Number(input) : type === 'boolean' ? !!input
      : type === 'json' ? jsonArgument(input) : input
  }
  return result
}
