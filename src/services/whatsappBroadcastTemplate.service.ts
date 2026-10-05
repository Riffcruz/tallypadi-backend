export type WhatsAppTemplateComponent = {
  type: 'body' | 'button';
  sub_type?: 'url';
  index?: string;
  parameters: Array<{
    type: 'text';
    text: string;
    parameter_name?: 'customer_name' | 'update_title' | 'update_message';
  }>;
};

const cleanTemplateValue = (value: unknown, fallback: string, maxLength: number) => {
  const cleaned = String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength);

  return cleaned || fallback;
};

export const buildTallyPadiUpdateTemplateComponents = (input: {
  customerName?: string;
  updateTitle: string;
  updateMessage: string;
  buttonUrlParameter?: string;
}): WhatsAppTemplateComponent[] => {
  const components: WhatsAppTemplateComponent[] = [
    {
      type: 'body',
      parameters: [
        {
          type: 'text',
          parameter_name: 'customer_name',
          text: cleanTemplateValue(input.customerName, 'there', 80),
        },
        {
          type: 'text',
          parameter_name: 'update_title',
          text: cleanTemplateValue(input.updateTitle, 'TallyPadi update', 100),
        },
        {
          type: 'text',
          parameter_name: 'update_message',
          text: cleanTemplateValue(input.updateMessage, 'Open TallyPadi to learn more.', 700),
        },
      ],
    },
  ];

  const buttonUrlParameter = cleanTemplateValue(input.buttonUrlParameter, '', 512);
  if (buttonUrlParameter) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: buttonUrlParameter }],
    });
  }

  return components;
};
