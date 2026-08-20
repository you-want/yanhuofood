// 微信明文事件只读取少量文本字段。这里不使用 XML 实体解析器，因此不会展开外部实体。
export function wechatXmlText(xml: string, tag: string) {
  if (!/^[A-Za-z][A-Za-z0-9_:-]*$/.test(tag)) return "";
  const match = new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>|<${tag}>(.*?)<\\/${tag}>`, "s").exec(xml);
  return (match?.[1] || match?.[2] || "").trim();
}


function cdata(value: string) {
  return value.replaceAll("]]>", "]]]]><![CDATA[>");
}

export function wechatTextReplyXml(input: { toUserName: string; fromUserName: string; content: string }) {
  return `<xml>
<ToUserName><![CDATA[${cdata(input.toUserName)}]]></ToUserName>
<FromUserName><![CDATA[${cdata(input.fromUserName)}]]></FromUserName>
<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${cdata(input.content)}]]></Content>
</xml>`;
}
