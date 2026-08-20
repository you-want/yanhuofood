import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // useEffect 里 setState 是常见且合理的模式，这条规则过于严格
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
