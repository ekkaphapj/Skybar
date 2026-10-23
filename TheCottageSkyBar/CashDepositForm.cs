using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Data.OleDb;

namespace TheCottageSkyBar
{
    public partial class CashDepositForm : Form
    {
        public CashDepositForm()
        {
            InitializeComponent();
        }

        private void button2_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        private void CashDepositForm_Load(object sender, EventArgs e)
        {
            this.ActiveControl = textBox2;
            textBox1.Text= Form1.getTotalCash(getDateTime(DateTime.Now.ToShortDateString())).ToString();

        }

        private string getDateTime(string date)
        {
            string dateNewFormat = Convert.ToDateTime(date).ToString("MM/dd/yyyy", System.Globalization.CultureInfo.InvariantCulture);
            return dateNewFormat;

        }

        private void textBox2_TextChanged(object sender, EventArgs e)
        {
            try
            {
                if (textBox2.Text == "")
                    textBox3.Text = "";
                else
                {
                    double _temp = Convert.ToDouble(textBox2.Text);
                    double _total = 0;
                    if (textBox1.Text != "")
                    {
                        _total = (Convert.ToDouble(textBox1.Text) - _temp);
                        if (_total<0)
                        {
                            MessageBox.Show("ตัดจ่ายมากกว่าเงินที่มีไม่ได้");
                            textBox2.Text = "";
                        }
                        else
                        {
                            textBox3.Text = _total.ToString();
                        }
                    }
                }
            }
            catch (Exception)
            {
                MessageBox.Show("ใส่เฉพาะตัวเลข");
            }
        }

        private bool UpdateCash()
        {
            int _success = 0;
            string strSQL = "INSERT INTO CASH(DATE1,TYPE1,LIST,TIME1,AMOUNT) VALUES(#" + getDateTime(DateTime.Now.ToShortDateString()) + "#,'ตัดจ่าย','ตัดจ่ายเงินสด',#" + DateTime.Now.ToShortTimeString() + "#,-" + textBox2.Text + ")";
            OleDbConnection connection = new OleDbConnection(Form1.connStringMain);
            OleDbCommand command = new OleDbCommand(strSQL, connection);
            connection.Open();      
            command = new OleDbCommand(strSQL, connection);
            _success= command.ExecuteNonQuery();
            connection.Close();
            if (_success != 0)
                return true;
            else
                return false;
        }

        private void button1_Click(object sender, EventArgs e)
        {
            if (UpdateCash())
            {
                MessageBox.Show("ทำการบันทึกการตัดจ่ายเงินสดเรียบร้อยแล้ว");
                this.Close();
            }
            else
                MessageBox.Show("ทำการตัดจ่ายเงินไม่สำเร็จ");
        }
    }
}
