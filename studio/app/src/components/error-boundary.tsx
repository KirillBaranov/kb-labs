/**
 * @module @kb-labs/studio-app/components/ErrorBoundary
 * Custom error boundary for React Router with friendly UI
 */

import * as React from 'react';
import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';
import {
  UIResult, UIButton, UICard, UITypographyText, UITypographyParagraph,
  UISpace, UIAccordion, UITag, UIMessage, UIIcon,
} from '@kb-labs/studio-ui-kit';

export function ErrorBoundary() {
  const error = useRouteError();
  const [copied, setCopied] = React.useState(false);

  let title = 'Упс! Что-то пошло не так';
  let description = 'Произошла непредвиденная ошибка';
  let status: 'error' | 'warning' | '404' | '500' | 'info' = 'error';
  let suggestion = 'Попробуйте перезагрузить страницу или вернуться на главную';

  if (isRouteErrorResponse(error)) {
    // React Router error response
    if (error.status === 404) {
      status = '404';
      title = 'Страница не найдена';
      description = 'К сожалению, запрошенная страница не существует';
      suggestion = 'Проверьте адрес или вернитесь на главную страницу';
    } else {
      status = '500';
      title = `Ошибка ${error.status}`;
      description = error.statusText || error.data?.message || description;
    }
  } else if (error instanceof Error) {
    // JavaScript error
    description = error.message;

    // Friendly message for common errors
    if (error.message.includes('Unsupported data source')) {
      title = 'Ошибка конфигурации виджета';
      description = 'Виджет имеет некорректную настройку источника данных';
      suggestion = 'Это ошибка в манифесте плагина. Обратитесь к разработчику.';
      status = 'warning';
    } else if (error.message.includes('not found') || error.message.includes('404')) {
      title = 'Ресурс не найден';
      description = 'Запрошенный ресурс не существует';
      suggestion = 'Проверьте настройки плагина или обратитесь к администратору';
      status = '404';
    } else if (error.message.includes('Failed to fetch')) {
      title = 'Ошибка сети';
      description = 'Не удалось подключиться к серверу';
      suggestion = 'Проверьте подключение к интернету и попробуйте снова';
      status = 'warning';
    }
  }

  // Extract error details
  const errorDetails = error instanceof Error ? {
    name: error.name,
    message: error.message,
    stack: error.stack,
  } : null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      backgroundColor: 'var(--bg-tertiary)',
    }}>
      <UICard
        style={{
          maxWidth: '800px',
          width: '100%',
          borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          backgroundColor: 'var(--bg-secondary)',
        }}
        styles={{ body: { padding: '3rem' } }}
      >
        <UIResult
          status={status}
          title={<span style={{ fontSize: '1.5rem', fontWeight: 600 }}>{title}</span>}
          subTitle={
            <UISpace direction="vertical" size="middle" style={{ width: '100%', marginTop: '1rem' }}>
              <UITypographyParagraph style={{ fontSize: '1rem', color: 'var(--text-secondary)', margin: 0 }}>
                {description}
              </UITypographyParagraph>
              <UITypographyText type="secondary" style={{ fontSize: '0.875rem' }}>
                💡 {suggestion}
              </UITypographyText>
            </UISpace>
          }
          extra={
            <UISpace direction="vertical" size="large" style={{ width: '100%', marginTop: '1.5rem' }}>
              <UISpace size="middle">
                <Link to="/">
                  <UIButton variant="primary" size="large" icon={<UIIcon name="HomeOutlined" />}>
                    На главную
                  </UIButton>
                </Link>
                <UIButton
                  size="large"
                  icon={<UIIcon name="ReloadOutlined" />}
                  onClick={() => window.location.reload()}
                >
                  Перезагрузить
                </UIButton>
              </UISpace>

              {/* Error Details Accordion */}
              {errorDetails && (
                <UIAccordion
                  ghost
                  style={{ width: '100%', textAlign: 'left' }}
                  items={[
                    {
                      key: 'details',
                      label: 'Детали ошибки (для разработчиков)',
                      children: (
                        <UISpace direction="vertical" size="middle" style={{ width: '100%' }}>
                          {/* Error Type */}
                          <div>
                            <UITypographyText type="secondary" style={{ fontSize: '0.75rem' }}>Тип ошибки:</UITypographyText>
                            <div style={{ marginTop: 4 }}>
                              <UITag variant="error" icon={<UIIcon name="CodeOutlined" />}>
                                {errorDetails.name}
                              </UITag>
                            </div>
                          </div>

                          {/* Error Message */}
                          <div>
                            <UITypographyText type="secondary" style={{ fontSize: '0.75rem' }}>Сообщение:</UITypographyText>
                            <div
                              style={{
                                marginTop: 4,
                                padding: '12px',
                                background: 'var(--bg-secondary)',
                                borderRadius: '8px',
                                fontFamily: 'monospace',
                                fontSize: '0.875rem',
                                wordBreak: 'break-word',
                              }}
                            >
                              <UITypographyText code>{errorDetails.message}</UITypographyText>
                            </div>
                          </div>

                          {/* Stack Trace */}
                          {errorDetails.stack && (
                            <div>
                              <UITypographyText type="secondary" style={{ fontSize: '0.75rem' }}>Stack Trace:</UITypographyText>
                              <div
                                style={{
                                  marginTop: 4,
                                  padding: '12px',
                                  background: '#1e1e1e',
                                  borderRadius: '8px',
                                  maxHeight: '300px',
                                  overflow: 'auto',
                                }}
                              >
                                <pre
                                  style={{
                                    margin: 0,
                                    fontFamily: 'Monaco, Menlo, "Courier New", monospace',
                                    fontSize: '0.75rem',
                                    lineHeight: 1.5,
                                    color: '#d4d4d4',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                  }}
                                >
                                  {errorDetails.stack}
                                </pre>
                              </div>
                            </div>
                          )}

                          {/* Copy to Clipboard */}
                          <UIButton
                            size="small"
                            variant={copied ? 'primary' : 'default'}
                            icon={copied ? <UIIcon name="CheckOutlined" /> : <UIIcon name="CopyOutlined" />}
                            onClick={() => {
                              const text = `${errorDetails.name}: ${errorDetails.message}\n\n${errorDetails.stack || 'No stack trace'}`;
                              navigator.clipboard.writeText(text);
                              setCopied(true);
                              UIMessage.success('Ошибка скопирована в буфер обмена');
                              setTimeout(() => setCopied(false), 2000);
                            }}
                          >
                            {copied ? 'Скопировано!' : 'Скопировать в буфер обмена'}
                          </UIButton>
                        </UISpace>
                      ),
                    },
                  ]}
                />
              )}
            </UISpace>
          }
        />
      </UICard>
    </div>
  );
}
