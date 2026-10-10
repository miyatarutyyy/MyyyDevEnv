;;; retro-orange-theme.el --- retro-orange theme -*- lexical-binding: t; -*-

;; Copyright (C) 2005, 2006 Xavier Maillard <zedek@gnu.org>
;; Copyright (C) 2005, 2006 Brian Palmer <bpalmer@gmail.com>
;; Copyright (C) 2013 by Syohei YOSHIDA
;; Author: Syohei YOSHIDA <syohex@gmail.com>
;; URL: https://github.com/emacs-jp/replace-colorthemes
;; Version: 0.01

;; This program is free software; you can redistribute it and/or modify
;; it under the terms of the GNU General Public License as published by
;; the Free Software Foundation, either version 3 of the License, or
;; (at your option) any later version.
;; This program is distributed in the hope that it will be useful,
;; but WITHOUT ANY WARRANTY; without even the implied warranty of
;; MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
;; GNU General Public License for more details.
;; You should have received a copy of the GNU General Public License
;; along with this program. If not, see <http://www.gnu.org/licenses/>.

;;; Commentary:

;; Port of retro-orange theme from `color-themes'.

;;; Code:

(deftheme retro-orange
  "Retro orange theme.")

(let ((foreground "#F66E25")
      (faces '((default ((t (:background "black" :foreground "#F66E25"))))
               (mouse ((t (:foreground "#F66E25"))))
               (cursor ((t (:background "#F66E25"))))
               (border ((t (:foreground "#F66E25")))))))
  (dolist (face (face-list))
    (cond
     ((memq face '(bold bold-italic))
      (add-to-list 'faces `(,face ((t (:bold t)))))
      )
     ((memq face '(italic underline show-paren-mismatch-face))
      (add-to-list 'faces `(,face ((t (:underline t)))))
      )
     ((memq face '(mode-line highlight region secondary-selection
                   show-paren-match-face))
      (add-to-list 'faces `(,face ((t (:foreground "black"
                                      :background ,foreground
                                      :inverse t)))))
      )
     (t
      (unless (memq face '(default mouse cursor border
                           eglot-semantic-namespace eglot-semantic-type
                           eglot-semantic-class eglot-semantic-enum
                           eglot-semantic-interface eglot-semantic-struct
                           eglot-semantic-typeParameter eglot-semantic-parameter
                           eglot-semantic-variable eglot-semantic-property
                           eglot-semantic-enumMember eglot-semantic-event
                           eglot-semantic-function eglot-semantic-method
                           eglot-semantic-macro eglot-semantic-keyword
                           eglot-semantic-modifier eglot-semantic-comment
                           eglot-semantic-string eglot-semantic-number
                           eglot-semantic-regexp eglot-semantic-operator
                           eglot-semantic-decorator eglot-semantic-declaration
                           eglot-semantic-definition eglot-semantic-readonly
                           eglot-semantic-static eglot-semantic-deprecated
                           eglot-semantic-abstract eglot-semantic-async
                           eglot-semantic-modification eglot-semantic-documentation
                           eglot-semantic-defaultLibrary
                           flymake-error flymake-warning flymake-note
                           eglot-diagnostic-tag-unnecessary-face
                           eglot-diagnostic-tag-deprecated-face))
        (add-to-list 'faces `(,face ((t (nil)))))))))
  (apply 'custom-theme-set-faces 'retro-orange faces)
  ;; Give Eglot semantic tokens their own palette, independent of font-lock faces.
  ;; These settings come after the generic face reset above intentionally.
  (custom-theme-set-faces
   'retro-orange
   '(eglot-semantic-namespace      ((t (:foreground "#A874C4"))))
   '(eglot-semantic-type           ((t (:foreground "#A874C4" :weight bold))))
   '(eglot-semantic-class          ((t (:foreground "#A874C4" :weight bold))))
   '(eglot-semantic-enum           ((t (:foreground "#A874C4" :weight bold))))
   '(eglot-semantic-interface      ((t (:foreground "#A874C4" :weight bold))))
   '(eglot-semantic-struct         ((t (:foreground "#A874C4" :weight bold))))
   '(eglot-semantic-typeParameter  ((t (:foreground "#A874C4" :slant italic))))
   '(eglot-semantic-parameter      ((t (:foreground "#F66E25"))))
   '(eglot-semantic-variable       ((t (:foreground "#F66E25"))))
   '(eglot-semantic-property       ((t (:foreground "#7189CC"))))
   '(eglot-semantic-enumMember     ((t (:foreground "#D6BF55"))))
   '(eglot-semantic-event          ((t (:foreground "#93B84F"))))
   '(eglot-semantic-function       ((t (:foreground "#93B84F" :weight bold))))
   '(eglot-semantic-method         ((t (:foreground "#93B84F"))))
   '(eglot-semantic-macro          ((t (:foreground "#D96A32" :weight bold))))
   '(eglot-semantic-keyword        ((t (:foreground "#D96A32" :weight bold))))
   '(eglot-semantic-modifier       ((t (:foreground "#D96A32"))))
   '(eglot-semantic-comment        ((t (:foreground "#78909C" :slant italic))))
   '(eglot-semantic-string         ((t (:foreground "#62B8C6"))))
   '(eglot-semantic-number         ((t (:foreground "#D6BF55"))))
   '(eglot-semantic-regexp         ((t (:foreground "#62B8C6" :weight bold))))
   '(eglot-semantic-operator       ((t (:foreground "#D96A32"))))
   '(eglot-semantic-decorator      ((t (:foreground "#A874C4" :weight bold))))
   ;; Modifiers are composed with the token-type face by Eglot.
   '(eglot-semantic-declaration    ((t (:weight bold))))
   '(eglot-semantic-definition     ((t (:weight bold))))
   '(eglot-semantic-readonly       ((t (:foreground "#D6BF55" :weight bold))))
   '(eglot-semantic-static         ((t (:foreground "#D96A32"))))
   '(eglot-semantic-deprecated     ((t (:foreground "#D45B6B" :strike-through t))))
   '(eglot-semantic-abstract       ((t (:slant italic))))
   '(eglot-semantic-async          ((t (:weight bold))))
   '(eglot-semantic-modification   ((t (:underline t))))
   '(eglot-semantic-documentation  ((t (:foreground "#78909C" :slant italic))))
   '(eglot-semantic-defaultLibrary ((t (:foreground "#7189CC"))))
   ;; Flymake renders LSP diagnostics; these are intentionally separate from tokens.
   '(flymake-error                 ((t (:underline (:style wave :color "#D45B6B")))))
   '(flymake-warning               ((t (:underline (:style wave :color "#D6BF55")))))
   '(flymake-note                  ((t (:underline (:style wave :color "#7189CC")))))
   '(eglot-diagnostic-tag-unnecessary-face ((t (:foreground "#78909C"))))
   '(eglot-diagnostic-tag-deprecated-face ((t (:foreground "#D45B6B" :strike-through t))))))

;;;###autoload
(when load-file-name
  (add-to-list 'custom-theme-load-path
               (file-name-as-directory (file-name-directory load-file-name))))

(provide-theme 'retro-orange)

;;; retro-orange-theme.el ends here
