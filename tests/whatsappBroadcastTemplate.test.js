const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildTallyPadiUpdateTemplateComponents,
} = require('../dist/services/whatsappBroadcastTemplate.service');

test('builds the approved TallyPadi update template with named body parameters', () => {
  assert.deepEqual(
    buildTallyPadiUpdateTemplateComponents({
      customerName: 'SnowTech',
      updateTitle: 'New invoice tools',
      updateMessage: 'You can now create and share invoices faster.',
    }),
    [
      {
        type: 'body',
        parameters: [
          { type: 'text', parameter_name: 'customer_name', text: 'SnowTech' },
          { type: 'text', parameter_name: 'update_title', text: 'New invoice tools' },
          {
            type: 'text',
            parameter_name: 'update_message',
            text: 'You can now create and share invoices faster.',
          },
        ],
      },
    ]
  );
});

test('adds a dynamic URL button parameter only when supplied', () => {
  const components = buildTallyPadiUpdateTemplateComponents({
    customerName: '',
    updateTitle: 'Stock update',
    updateMessage: 'See what changed.',
    buttonUrlParameter: 'marketplace',
  });

  assert.equal(components[0].parameters[0].text, 'there');
  assert.deepEqual(components[1], {
    type: 'button',
    sub_type: 'url',
    index: '0',
    parameters: [{ type: 'text', text: 'marketplace' }],
  });
});
