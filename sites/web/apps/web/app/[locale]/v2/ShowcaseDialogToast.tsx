'use client';

import {
  Button,
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
  FormField,
  Input,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Toaster,
  toast,
} from '@kb-labs/web-site-ui';

export function ShowcaseDialogToast() {
  return (
    <>
      <div className="flex flex-wrap gap-3 justify-center">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="secondary">Open dialog</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join the waitlist</DialogTitle>
              <DialogDescription>
                Get early access to KB Labs Pro. We'll notify you when your spot is ready.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <FormField label="Email address" required>
                <Input type="email" placeholder="you@example.com" />
              </FormField>
              <FormField label="Deployment preference">
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="onprem">On-premises now</SelectItem>
                    <SelectItem value="saas">SaaS later</SelectItem>
                    <SelectItem value="undecided">Not sure yet</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <DialogFooter>
              <Button variant="secondary">Cancel</Button>
              <Button variant="primary">Join waitlist</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button variant="secondary" onClick={() => toast({ title: 'Notification', description: 'This is a default toast.' })}>
          Default toast
        </Button>
        <Button variant="secondary" onClick={() => toast({ variant: 'success', title: 'Deployed!', description: 'Workflow pushed to production in 2.4s.' })}>
          Success toast
        </Button>
        <Button variant="secondary" onClick={() => toast({ variant: 'danger', title: 'Build failed', description: 'Check logs with kb-dev logs workflow.' })}>
          Error toast
        </Button>
      </div>
      <Toaster />
    </>
  );
}
