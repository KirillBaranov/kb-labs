/**
 * UIUpload component - File upload
 *
 * Wraps Ant Design Upload.
 */

import * as React from 'react';
import { Upload as AntUpload, type UploadProps as AntUploadProps } from 'antd';

export interface UIUploadProps extends AntUploadProps {}

export function UIUpload(props: UIUploadProps) {
  return <AntUpload {...props} />;
}

export function UIUploadDragger(props: React.ComponentProps<typeof AntUpload.Dragger>) {
  return <AntUpload.Dragger {...props} />;
}
